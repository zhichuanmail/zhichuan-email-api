// apollo-search-sensor-users.js — 搜索使用倾角传感器的国外终端客户
// 部署到 Vercel，端点：/api/apollo-search

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { api_key, num_contacts = 10 } = req.body;

    if (!api_key) {
      return res.status(400).json({ success: false, error: 'Missing api_key' });
    }

    // ── 使用倾角传感器的国外终端客户公司列表（非传感器制造商） ──
    const SENSOR_USER_COMPANIES = [
      // 岩土监测/边坡监测服务商
      { name: 'Golder Associates', country: 'Canada', region: '北美', industry: '岩土监测', priority: 'high', website: 'golder.com', description: '岩土工程和监测服务' },
      { name: 'Coffey International', country: 'Australia', region: '大洋洲', industry: '岩土监测', priority: 'medium', website: 'tetratech.com', description: '岩土工程咨询和监测' },
      { name: 'Arup', country: 'UK', region: '欧洲', industry: '岩土监测', priority: 'high', website: 'arup.com', description: '工程设计和监测' },
      
      // 结构监测/SHM服务商
      { name: 'Pure Technologies', country: 'Canada', region: '北美', industry: '结构监测', priority: 'high', website: 'puretechnologies.com', description: '基础设施结构健康监测' },
      { name: 'Structural Monitoring Systems', country: 'Australia', region: '大洋洲', industry: '结构监测', priority: 'medium', website: 'sms-plc.com', description: '结构监测系统' },
      { name: 'Mistras Group', country: 'USA', region: '北美', industry: '结构监测', priority: 'high', website: 'mistrasgroup.com', description: '无损检测和结构监测' },
      
      // 工程机械租赁/运营公司（使用传感器监测设备）
      { name: 'United Rentals', country: 'USA', region: '北美', industry: '工程机械', priority: 'high', website: 'unitedrentals.com', description: '工程设备租赁公司' },
      { name: 'Herc Rentals', country: 'USA', region: '北美', industry: '工程机械', priority: 'medium', website: 'hercrentals.com', description: '工程机械租赁' },
      { name: 'Sunbelt Rentals', country: 'USA', region: '北美', industry: '工程机械', priority: 'medium', website: 'sunbeltrentals.com', description: '设备租赁服务' },
      { name: 'Loxam', country: 'France', region: '欧洲', industry: '工程机械', priority: 'medium', website: 'loxam.com', description: '欧洲设备租赁公司' },
      
      // 基础设施运营商（需要监测桥梁、隧道等）
      { name: 'Ferrovial', country: 'Spain', region: '欧洲', industry: '基础设施', priority: 'high', website: 'ferrovial.com', description: '基础设施管理和运营' },
      { name: 'VINCI Highways', country: 'France', region: '欧洲', industry: '基础设施', priority: 'high', website: 'vinci.com', description: '高速公路运营和维护' },
      { name: 'Transurban', country: 'Australia', region: '大洋洲', industry: '基础设施', priority: 'medium', website: 'transurban.com', description: '收费公路运营商' },
      
      // 建筑监测/房屋监测公司
      { name: 'Bureau Veritas', country: 'France', region: '欧洲', industry: '建筑监测', priority: 'high', website: 'bureauveritas.com', description: '建筑检验和监测' },
      { name: 'DNV GL', country: 'Norway', region: '欧洲', industry: '建筑监测', priority: 'high', website: 'dnvgl.com', description: '风险管理和认证' },
      { name: 'SGS', country: 'Switzerland', region: '欧洲', industry: '建筑监测', priority: 'high', website: 'sgs.com', description: '检验、验证和监测' },
      
      // 矿山安全监测公司
      { name: 'Maptek', country: 'Australia', region: '大洋洲', industry: '矿山监测', priority: 'medium', website: 'maptek.com', description: '矿山监测和测量' },
      { name: 'Deswik', country: 'Australia', region: '大洋洲', industry: '矿山监测', priority: 'medium', website: 'deswik.com', description: '矿山工程软件和监测' },
      
      // 桥梁检测/监测公司
      { name: 'Modjeski and Masters', country: 'USA', region: '北美', industry: '桥梁监测', priority: 'high', website: 'modjeski.com', description: '桥梁工程和监测' },
      { name: 'HNTB Corporation', country: 'USA', region: '北美', industry: '桥梁监测', priority: 'medium', website: 'hntb.com', description: '基础设施工程和监测' },
      
      // 隧道监测公司
      { name: 'Jacobs Engineering', country: 'USA', region: '北美', industry: '隧道监测', priority: 'high', website: 'jacobs.com', description: '隧道工程和监测' },
      { name: 'Mott MacDonald', country: 'UK', region: '欧洲', industry: '隧道监测', priority: 'medium', website: 'mottmac.com', description: '隧道和地下工程监测' },
      
      // 物联网监测解决方案商
      { name: 'Sierra Wireless', country: 'Canada', region: '北美', industry: '物联网监测', priority: 'high', website: 'sierrawireless.com', description: '物联网解决方案' },
      { name: 'Telit', country: 'UK', region: '欧洲', industry: '物联网监测', priority: 'medium', website: 'telit.com', description: '物联网模块和解决方案' },
      { name: 'u-blox', country: 'Switzerland', region: '欧洲', industry: '物联网监测', priority: 'medium', website: 'u-blox.com', description: '定位和无线通信模块' },
      
      // 风电监测公司（使用倾角传感器监测塔筒）
      { name: 'Vestas', country: 'Denmark', region: '欧洲', industry: '风电监测', priority: 'high', website: 'vestas.com', description: '风力发电机制造和监测' },
      { name: 'Siemens Gamesa', country: 'Spain', region: '欧洲', industry: '风电监测', priority: 'high', website: 'siemensgamesa.com', description: '风力发电机监测' },
      
      // 石油天然气设备监测
      { name: 'Wood Group (formerly Amec Foster Wheeler)', country: 'UK', region: '欧洲', industry: '设备监测', priority: 'high', website: 'woodplc.com', description: '石油天然气设备监测' },
      { name: 'Worley', country: 'Australia', region: '大洋洲', industry: '设备监测', priority: 'medium', website: 'worley.com', description: '能源设备工程和监测' },
      
      // 港口/码头设备监测
      { name: 'DP World', country: 'UAE', region: '中东', industry: '港口监测', priority: 'high', website: 'dpworld.com', description: '港口设备运营和监测' },
      { name: 'PSA International', country: 'Singapore', region: '亚太', industry: '港口监测', priority: 'medium', website: 'psa.com.sg', description: '港口运营和设备监测' },
      
      // 铁路监测公司
      { name: 'Network Rail', country: 'UK', region: '欧洲', industry: '铁路监测', priority: 'high', website: 'networkrail.co.uk', description: '铁路基础设施监测' },
      { name: 'SNCF Réseau', country: 'France', region: '欧洲', industry: '铁路监测', priority: 'medium', website: 'sncf-reseau.fr', description: '法国铁路网络监测' },
      
      // 大坝安全监测
      { name: 'US Army Corps of Engineers', country: 'USA', region: '北美', industry: '大坝监测', priority: 'high', website: 'usace.army.mil', description: '大坝安全监测' },
      { name: 'Hydro-Québec', country: 'Canada', region: '北美', industry: '大坝监测', priority: 'medium', website: 'hydroquebec.com', description: '水电设施监测' }
    ];

    // 随机选择目标数量的公司
    const maxContacts = Math.min(parseInt(num_contacts) || 10, 30);
    const shuffledCompanies = [...SENSOR_USER_COMPANIES].sort(() => Math.random() - 0.5);
    const selectedCompanies = shuffledCompanies.slice(0, maxContacts);

    const contacts = [];
    const debug = { 
      companies_selected: selectedCompanies.map(c => ({name: c.name, industry: c.industry})),
      api_calls: [],
      enrich_calls: [],
      found_with_email: 0
    };

    // ── 对每个公司调用 Apollo API 搜索联系人 ──
    for (const company of selectedCompanies) {
      if (contacts.length >= maxContacts) break;

      try {
        // 搜索相关职位：采购、工程、技术、设备管理
        const searchBody = {
          q_organization_name: company.name,
          page: 1,
          per_page: 5,
          person_titles: [
            'Procurement Manager', 'Purchasing Manager', 'Sourcing Manager',
            'Maintenance Manager', 'Equipment Manager', 'Technical Manager',
            'Project Engineer', 'Field Engineer', 'Instrumentation Engineer',
            'Engineering Manager', 'Operations Manager', 'Facility Manager',
            'Asset Manager', 'Reliability Engineer', 'Monitoring Engineer'
          ]
        };

        const resp = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Api-Key': api_key
          },
          body: JSON.stringify(searchBody),
          timeout: 10000
        });

        const respText = await resp.text();
        debug.api_calls.push({
          company: company.name,
          status: resp.status,
          preview: respText.substring(0, 100)
        });

        if (!resp.ok) continue;

        let data;
        try { 
          data = JSON.parse(respText); 
        } catch { 
          continue; 
        }

        const people = data.people || [];
        
        // 对每个找到的人尝试获取邮箱
        for (const person of people.slice(0, 2)) {
          if (contacts.length >= maxContacts) break;

          let email = person.email || '';
          
          // 如果没有直接邮箱，尝试 enrich API
          if (!email && person.id) {
            try {
              const enrichResp = await fetch('https://api.apollo.io/v1/people/enrich', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Api-Key': api_key
                },
                body: JSON.stringify({
                  id: person.id,
                  first_name: person.first_name,
                  last_name: person.last_name,
                  organization_name: company.name,
                  organization_domain: company.website
                }),
                timeout: 8000
              });
              
              if (enrichResp.ok) {
                const enrichData = await enrichResp.json();
                email = enrichData.person?.email || '';
                debug.enrich_calls.push({
                  person_id: person.id,
                  success: !!email
                });
              }
            } catch (err) {
              console.warn(`[enrich] Failed for ${person.id}:`, err.message);
            }
          }

          // 如果有邮箱，添加到结果
          if (email) {
            const contactName = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown';
            
            const customer = {
              company: company.name,
              country: company.country,
              region: company.region,
              industry: company.industry,
              domain: company.description,
              priority: company.priority,
              contact: contactName,
              title: person.title || '',
              email: email,
              website: company.website,
              emailStatus: 'new',
              emailQuality: checkEmailQuality(email, company.website),
              linkedinUrl: person.linkedin_url || '',
              phone: person.phone_numbers?.[0] || '',
              source: 'Apollo.io (传感器用户搜索)',
              description: company.description,
              raw_company: {
                name: company.name,
                industry: company.industry
              }
            };
            
            contacts.push(customer);
            debug.found_with_email++;
          }
        }
      } catch (error) {
        console.error(`[search] Failed for ${company.name}:`, error.message);
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
    console.error('[apollo-search-sensor-users] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}

function checkEmailQuality(email, companyDomain) {
  if (!email) return 'unknown';
  
  const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'qq.com', '163.com'];
  const emailDomain = email.split('@')[1] || '';
  
  if (genericDomains.includes(emailDomain.toLowerCase())) {
    return 'generic';
  }
  
  if (companyDomain && emailDomain.toLowerCase().includes(companyDomain.toLowerCase())) {
    return 'company';
  }
  
  return 'verified';
}
