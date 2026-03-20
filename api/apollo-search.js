// apollo-search.js — 直川传感器意向客户搜索云函数（最终版：过滤无邮箱客户+完整字段）
// 部署到 Vercel，端点：/api/apollo-search

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { api_key, keywords, num_contacts = 10 } = req.body;

    if (!api_key) {
      return res.status(400).json({ success: false, error: 'Missing api_key' });
    }

    // ── 内置搜索关键词（直川传感器相关行业） ──
    const DEFAULT_KEYWORDS = [
      'inclination sensor', 'tilt sensor', 'inclinometer', 'MEMS tilt sensor',
      'angular displacement', 'draw wire sensor', 'wire rope displacement',
      'string potentiometer', 'magnetic encoder', 'rotary encoder',
      'vibration sensor', 'accelerometer monitoring',
      'geotechnical monitoring', 'slope stability', 'bridge monitoring',
      'tunnel monitoring', 'building monitoring', 'construction machinery',
      'crane sensor', 'excavator monitoring'
    ];

    // 解析用户自定义关键词
    const userKeywords = (keywords || '')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const searchKeywords = userKeywords.length > 0 ? userKeywords : DEFAULT_KEYWORDS;

    // 只收集有邮箱的客户
    const contacts = [];
    const maxContacts = Math.min(parseInt(num_contacts) || 10, 50);
    const debug = { 
      keywords_tried: [], 
      raw_people_count: 0, 
      filtered_by_competitor: 0,
      enrich_results: [],
      api_responses: [],
      filtered_no_email: 0
    };

    // ── 轮流使用关键词搜索，直到凑够足够的有邮箱客户 ──
    for (let ki = 0; ki < searchKeywords.length && contacts.length < maxContacts; ki++) {
      const kw = searchKeywords[ki];
      debug.keywords_tried.push(kw);

      for (let page = 1; page <= 5 && contacts.length < maxContacts; page++) { // 增加到5页
        const perPage = Math.min((maxContacts - contacts.length) * 3, 25); // 搜索更多以确保找到有邮箱的

        const searchBody = {
          q_keywords: kw,
          page: page,
          per_page: perPage,
          organization_locations: [],
        };

        let resp, respText;
        try {
          const apolloEndpoint = 'https://api.apollo.io/v1/mixed_people/api_search';
          resp = await fetch(apolloEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Api-Key': api_key
            },
            body: JSON.stringify(searchBody),
            timeout: 15000
          });
          respText = await resp.text();
        } catch (fetchErr) {
          debug.api_responses.push({ keyword: kw, page, error: fetchErr.message });
          break;
        }

        debug.api_responses.push({
          keyword: kw, page,
          status: resp.status,
          body_preview: respText.substring(0, 200)
        });

        if (resp.status === 401 || resp.status === 403) {
          return res.status(200).json({
            success: false,
            error: 'Apollo API Key 无效或已过期，请检查 Key 是否正确',
            apollo_error: `HTTP ${resp.status}`,
            debug
          });
        }

        let data;
        try { 
          data = JSON.parse(respText); 
        } catch { 
          break; 
        }

        const people = data.people || data.contacts || [];
        debug.raw_people_count += people.length;
        debug.filtered_by_competitor += (data.filtered_by_competitor || 0);

        if (people.length === 0) break;

        // ── 使用 enrich API 分批获取邮箱，只保留有邮箱的客户 ──
        const batchSize = 5;
        for (let i = 0; i < people.length && contacts.length < maxContacts; i += batchSize) {
          const batch = people.slice(i, i + batchSize);
          
          const enrichedBatch = await Promise.all(
            batch.map(async (p) => {
              let email = p.email || '';
              let enrichSuccess = false;
              
              // 优先尝试 enrich API 获取邮箱
              if (!email && p.id) {
                try {
                  const enrichResp = await fetch('https://api.apollo.io/v1/people/enrich', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Api-Key': api_key
                    },
                    body: JSON.stringify({
                      id: p.id,
                      first_name: p.first_name,
                      last_name: p.last_name,
                      organization_name: p.organization?.name || p.organization_name,
                      organization_domain: p.organization?.primary_domain || p.organization?.website_url || ''
                    }),
                    timeout: 10000
                  });
                  
                  if (enrichResp.ok) {
                    const enrichData = await enrichResp.json();
                    email = enrichData.person?.email || '';
                    enrichSuccess = !!email;
                    debug.enrich_results.push({
                      person_id: p.id,
                      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
                      success: enrichSuccess,
                      email_found: !!email
                    });
                  }
                } catch (err) {
                  console.warn(`[enrich] Failed for ${p.id}:`, err.message);
                }
              }
              
              return { ...p, email, enrichSuccess };
            })
          );
          
          // 只处理有邮箱的客户
          for (const p of enrichedBatch) {
            const companyName = (p.organization?.name || p.organization_name || '').trim();
            const email = p.email || '';
            
            if (!email) {
              debug.filtered_no_email++;
              continue; // 跳过无邮箱客户
            }
            
            if (contacts.length >= maxContacts) break;
            
            // ── 构建完整的客户信息 ──
            const country = p.country || p.organization?.country || '';
            const website = p.organization?.website_url || p.organization?.primary_domain || '';
            const contactName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
            
            // 判断行业
            const industry = detectIndustry(p, kw);
            
            // 判断优先级
            const priority = detectPriority(p.title);
            
            // 判断地区
            const region = detectRegion(country);
            
            // 判断邮箱质量
            const emailQuality = checkEmailQuality(email, p.organization?.primary_domain || '');
            
            // 构建完整客户信息
            const customer = {
              company: companyName,
              country: country,
              region: region,
              industry: industry,
              domain: p.organization?.industry || '传感器/自动化',
              priority: priority,
              contact: contactName,
              title: p.title || '',
              email: email,
              website: website.replace(/^https?:\/\//, ''),
              emailStatus: 'new',
              emailQuality: emailQuality,
              linkedinUrl: p.linkedin_url || '',
              phone: p.phone_numbers?.[0] || '',
              source: 'Apollo.io',
              enrichSuccess: p.enrichSuccess,
              raw_person: {
                id: p.id,
                name: contactName
              }
            };
            
            contacts.push(customer);
          }
        }
      }
    }

    const withEmailCount = contacts.filter(c => c.email).length;
    debug.with_email_count = withEmailCount;

    return res.status(200).json({
      success: true,
      contacts,
      total_found: contacts.length,
      total_with_email: withEmailCount,
      total_requested: maxContacts,
      debug
    });

  } catch (err) {
    console.error('[apollo-search] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}

// ── 工具函数 ──

function detectIndustry(person, keyword) {
  const desc = [
    person.organization?.short_description || '',
    person.organization?.industry || '',
    person.title || '',
    keyword
  ].join(' ').toLowerCase();
  
  if (/geo|slope|settle|landslide|retaining|embankment|岩土/.test(desc)) return '岩土监测';
  if (/struct|bridge|shm|health monitor|dam|building monitor/.test(desc)) return '结构监测';
  if (/crane|excavat|drill|machinery|heavy equipment|construction machine/.test(desc)) return '工程机械';
  if (/oil|gas|energy|petro|pipeline|wellhead|offshore energy/.test(desc)) return '能源行业';
  if (/mine|mining|quarry|pit/.test(desc)) return '矿山监测';
  if (/marine|offshore|vessel|ship|port|harbor|ocean/.test(desc)) return '船舶海洋';
  if (/construct|civil|epc|contractor|building site/.test(desc)) return '建筑工程';
  if (/infra|transport|rail|tunnel|road|highway|bridge/.test(desc)) return '基础设施';
  if (/auto|vehicle|car|truck/.test(desc)) return '汽车工业';
  if (/robot|automation/.test(desc)) return '自动化';
  if (/sensor|instrument|measurement/.test(desc)) return '传感器';
  
  return '制造业';
}

function detectPriority(title) {
  const t = (title || '').toLowerCase();
  if (/director|chief|vp|vice president|head of|cto|ceo|founder|总经理|总监|总裁/.test(t)) return 'high';
  if (/senior|lead|principal|specialist|高级|主管|经理/.test(t)) return 'medium';
  return 'medium';
}

function detectRegion(country) {
  const c = (country || '').toLowerCase();
  if (/usa|united states|canada|mexico/.test(c)) return '北美';
  if (/uk|germany|france|netherlands|spain|italy|sweden|norway|denmark|finland|switzerland|austria|belgium|poland/.test(c)) return '欧洲';
  if (/australia|new zealand/.test(c)) return '大洋洲';
  if (/japan|korea|singapore|thailand|malaysia|indonesia|vietnam|philippines/.test(c)) return '亚太';
  if (/india|pakistan|bangladesh/.test(c)) return '南亚';
  if (/brazil|argentina|chile|colombia|peru/.test(c)) return '拉丁美洲';
  if (/south africa|nigeria|kenya|egypt/.test(c)) return '非洲';
  if (/middle east|uae|saudi|qatar|kuwait|oman|bahrain|israel|turkey/.test(c)) return '中东';
  if (/china|hong kong|taiwan|macau|中国|台湾|香港|澳门/.test(c)) return '中国';
  return country || '其他';
}

function checkEmailQuality(email, companyDomain) {
  if (!email) return 'unknown';
  
  // 检查是否为通用邮箱
  const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'qq.com', '163.com'];
  const emailDomain = email.split('@')[1] || '';
  
  if (genericDomains.includes(emailDomain.toLowerCase())) {
    return 'generic';
  }
  
  // 检查是否匹配公司域名
  if (companyDomain && emailDomain.toLowerCase().includes(companyDomain.toLowerCase())) {
    return 'company';
  }
  
  return 'verified';
}
