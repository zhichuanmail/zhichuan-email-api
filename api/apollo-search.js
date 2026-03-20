// apollo-search.js — 直川传感器意向客户搜索云函数
// 部署到 Vercel，端点：/api/apollo-search

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { api_key, keywords, num_contacts = 10, existing_companies = [] } = req.body;

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

    // 去重集合
    const existingSet = new Set(
      (existing_companies || []).map(n => (n || '').toLowerCase().trim())
    );

    // 已收集的结果
    const contacts = [];
    const maxContacts = Math.min(parseInt(num_contacts) || 10, 50);
    const debug = { pages_searched: 0, raw_people_count: 0, filtered_by_duplicate: 0, api_responses: [] };

    // ── 轮流使用关键词搜索，直到凑够数量 ──
    for (let ki = 0; ki < searchKeywords.length && contacts.length < maxContacts; ki++) {
      const kw = searchKeywords[ki];

      for (let page = 1; page <= 3 && contacts.length < maxContacts; page++) {
        const perPage = Math.min(maxContacts - contacts.length + 5, 25);

        // 根据 Apollo API 文档，参数要包含 api_key 在 body 中
        const searchBody = {
          api_key: api_key,
          q_keywords: kw,
          page: page,
          per_page: perPage,
          person_titles: [
            'Procurement Manager', 'Purchasing Manager', 'Sourcing Manager',
            'Technical Director', 'Engineering Manager', 'Project Manager',
            'Operations Manager', 'Sales Director', 'Business Development',
            'Chief Engineer', 'Senior Engineer', 'Instrumentation Engineer'
          ],
          // 增加一些常用筛选条件
          organization_locations: [], // 所有地区
          contact_email_status: "verified", // 优先已验证邮箱
          person_seniorities: ["senior", "director", "vp", "c_suite"]
        };

        let resp, respText;
        try {
          // Apollo.io 可能有不同版本的端点，我们测试一下
          const apolloEndpoint = 'https://api.apollo.io/v1/mixed_people/search';
          resp = await fetch(apolloEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'Accept': 'application/json',
              'User-Agent': 'ZhiChuan-Email-API/1.0'
            },
            body: JSON.stringify(searchBody),
            timeout: 15000
          });
          respText = await resp.text();
        } catch (fetchErr) {
          debug.api_responses.push({ keyword: kw, page, error: fetchErr.message });
          break;
        }

        debug.pages_searched++;
        debug.api_responses.push({
          keyword: kw, page,
          status: resp.status,
          body_preview: respText.substring(0, 200)
        });

        // 401 / 403 → API Key 无效，直接终止
        if (resp.status === 401 || resp.status === 403) {
          return res.status(200).json({
            success: false,
            error: 'Apollo API Key 无效或已过期，请检查 Key 是否正确',
            apollo_error: `HTTP ${resp.status}`,
            debug
          });
        }

        let data;
        try { data = JSON.parse(respText); } catch { break; }

        const people = data.people || data.contacts || [];
        debug.raw_people_count += people.length;

        if (people.length === 0) break; // 该关键词无更多结果

        for (const p of people) {
          if (contacts.length >= maxContacts) break;

          const companyName = (p.organization?.name || p.organization_name || '').trim();
          const companyKey  = companyName.toLowerCase();

          // 跳过重复公司
          if (existingSet.has(companyKey)) { debug.filtered_by_duplicate++; continue; }
          existingSet.add(companyKey);

          // 整理联系人信息
          const email   = p.email || '';
          const contact = [p.first_name, p.last_name].filter(Boolean).join(' ');
          const title   = p.title || '';
          const country = p.country || p.organization?.country || '';
          const website = p.organization?.website_url || p.organization?.primary_domain || '';

          // 行业判断
          const orgDesc = [
            p.organization?.short_description || '',
            p.organization?.industry || '',
            title
          ].join(' ').toLowerCase();

          const industry = detectIndustry(orgDesc, kw);
          const priority = detectPriority(title);
          const region   = detectRegion(country);

          contacts.push({
            company:     companyName || 'Unknown',
            country,
            region,
            industry,
            domain:      p.organization?.industry || '',
            priority,
            contact,
            title,
            email,
            website:     website.replace(/^https?:\/\//, ''),
            emailStatus: 'new'
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      contacts,
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

function detectIndustry(desc, keyword) {
  const kw = (keyword + ' ' + desc).toLowerCase();
  if (/geo|slope|settle|landslide|retaining|embankment|岩土/.test(kw)) return 'geotechnical';
  if (/struct|bridge|shm|health monitor|dam|building monitor/.test(kw)) return 'structural';
  if (/crane|excavat|drill|machinery|heavy equipment|construction machine/.test(kw)) return 'machinery';
  if (/oil|gas|energy|petro|pipeline|wellhead|offshore energy/.test(kw)) return 'energy';
  if (/mine|mining|quarry|pit/.test(kw)) return 'mining';
  if (/marine|offshore|vessel|ship|port|harbor|ocean/.test(kw)) return 'marine';
  if (/construct|civil|epc|contractor|building site/.test(kw)) return 'construction';
  if (/infra|transport|rail|tunnel|road|highway|bridge/.test(kw)) return 'infrastructure';
  return 'other';
}

function detectPriority(title) {
  const t = (title || '').toLowerCase();
  if (/director|chief|vp|vice president|head of|cto|ceo|founder/.test(t)) return 'high';
  if (/senior|lead|principal|specialist/.test(t)) return 'medium';
  return 'medium';
}

function detectRegion(country) {
  const c = (country || '').toLowerCase();
  if (/usa|united states|canada|mexico/.test(c)) return 'North America';
  if (/uk|germany|france|netherlands|spain|italy|sweden|norway|denmark|finland|switzerland|austria|belgium|poland/.test(c)) return 'Europe';
  if (/australia|new zealand/.test(c)) return 'Oceania';
  if (/japan|korea|singapore|thailand|malaysia|indonesia|vietnam|philippines/.test(c)) return 'Asia Pacific';
  if (/india|pakistan|bangladesh/.test(c)) return 'South Asia';
  if (/brazil|argentina|chile|colombia|peru/.test(c)) return 'Latin America';
  if (/south africa|nigeria|kenya|egypt/.test(c)) return 'Africa';
  if (/middle east|uae|saudi|qatar|kuwait|oman|bahrain|israel|turkey/.test(c)) return 'Middle East';
  if (/china|hong kong/.test(c)) return 'China';
  return country || '';
}
