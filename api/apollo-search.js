// apollo-search.js — 直川传感器意向客户搜索云函数（修复过滤问题）
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

    // 已收集的结果
    const contacts = [];
    const maxContacts = Math.min(parseInt(num_contacts) || 10, 50);
    const debug = { 
      keywords_tried: [], 
      raw_people_count: 0, 
      filtered_by_competitor: 0,
      api_responses: [] 
    };

    // ── 轮流使用关键词搜索，直到凑够数量 ──
    for (let ki = 0; ki < searchKeywords.length && contacts.length < maxContacts; ki++) {
      const kw = searchKeywords[ki];
      debug.keywords_tried.push(kw);

      for (let page = 1; page <= 3 && contacts.length < maxContacts; page++) {
        const perPage = Math.min(maxContacts - contacts.length + 5, 25);

        // **简化搜索参数 - 移除所有可能导致过滤的条件**
        const searchBody = {
          q_keywords: kw,
          page: page,
          per_page: perPage,
          // 移除 person_titles 过滤，让更多人能被找到
          // 移除 contact_email_status 过滤，允许未验证邮箱
          // 移除 person_seniorities 过滤，允许所有层级
          organization_locations: [], // 所有地区
        };

        let resp, respText;
        try {
          // Apollo.io 新的 API 端点
          const apolloEndpoint = 'https://api.apollo.io/v1/mixed_people/api_search';
          resp = await fetch(apolloEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Api-Key': api_key  // API Key 必须放在这里
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
        try { 
          data = JSON.parse(respText); 
        } catch { 
          break; 
        }

        const people = data.people || data.contacts || [];
        debug.raw_people_count += people.length;
        debug.filtered_by_competitor += (data.filtered_by_competitor || 0);

        if (people.length === 0) break; // 该关键词无更多结果

        // 处理获取到的联系人
        for (const p of people) {
          if (contacts.length >= maxContacts) break;

          const companyName = (p.organization?.name || p.organization_name || '').trim();
          const email = p.email || '';
          
          // 只收集有公司名称的联系人
          if (companyName) {
            contacts.push({
              company: companyName,
              country: p.country || p.organization?.country || '',
              contact: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
              title: p.title || '',
              email: email,
              emailStatus: email ? 'new' : 'no_email',
              website: p.organization?.website_url || p.organization?.primary_domain || '',
              raw_person: {
                id: p.id,
                name: [p.first_name, p.last_name].filter(Boolean).join(' '),
                linkedin_url: p.linkedin_url
              }
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      contacts,
      total_found: contacts.length,
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
