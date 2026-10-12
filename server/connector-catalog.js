// Honest inventory of working and planned integrations.
// `configurationStatus` never implies that a carrier API is implemented.
const FREE_JOB_SOURCES = [
  {id:'himalayas', name:'Himalayas', variables:[], use:'remote contract/freelance search', api:'https://himalayas.app/docs/remote-jobs-api'},
  {id:'jobicy', name:'Jobicy', variables:[], use:'remote contract/freelance search', api:'https://github.com/Jobicy/remote-jobs-api'},
  {id:'remotive', name:'Remotive', variables:[], use:'remote contract/freelance search', api:'https://remotive.com/remote-jobs/api'},
  {id:'remotejobs', name:'RemoteJobs.org', variables:[], use:'remote contract/freelance search', api:'https://remotejobs.org/api-access'}
];

const OPTIONAL_SEARCH = [
  {id:'serper', name:'Serper', variables:['SERPER_API_KEY'], env:'SERPER_API_KEY', api:'https://serper.dev/'},
  {id:'exa', name:'Exa', variables:['EXA_API_KEY'], env:'EXA_API_KEY', api:'https://docs.exa.ai/'},
  {id:'firecrawl', name:'Firecrawl', variables:['FIRECRAWL_API_KEY'], env:'FIRECRAWL_API_KEY', api:'https://docs.firecrawl.dev/' }
];

// The env names below are a proposed, consistent RAM configuration contract.
// They are not consumed by a carrier adapter yet. Adding them to Railway alone
// cannot create bookings, labels, rate quotes, or tracking access.
const CARRIERS = [
  {id:'dhl_express', name:'DHL Express / MyDHL API', modes:['air','road'], variables:['DHL_API_KEY','DHL_API_SECRET','DHL_ACCOUNT_NUMBER'], docs:'https://developer.dhl.com/api-reference/dhl-express-mydhl-api', access:'active DHL Express customer account; credentials provided by DHL representative'},
  {id:'fedex', name:'FedEx APIs', modes:['air','road'], variables:['FEDEX_API_KEY','FEDEX_API_SECRET','FEDEX_ACCOUNT_NUMBER'], docs:'https://developer.fedex.com/api/en-us/get-started.html', access:'developer project, shipper account, test credentials and production validation'},
  {id:'ups', name:'UPS APIs', modes:['air','road'], variables:['UPS_CLIENT_ID','UPS_CLIENT_SECRET','UPS_ACCOUNT_NUMBER'], docs:'https://developer.ups.com/get-started', access:'UPS.com account and shipper account linked to an OAuth application'},
  {id:'maersk', name:'Maersk APIs', modes:['air','sea','road'], variables:['MAERSK_CLIENT_ID','MAERSK_CLIENT_SECRET','MAERSK_CUSTOMER_CODE'], docs:'https://developer.maersk.com/', access:'API product access; some booking APIs are restricted to approved customers/developers'},
  {id:'dhl_freight', name:'DHL Freight APIs', modes:['road'], variables:['DHL_FREIGHT_CLIENT_ID','DHL_FREIGHT_CLIENT_SECRET','DHL_FREIGHT_ACCOUNT_NUMBER'], docs:'https://developer.dhl.com/api-catalog', access:'DHL Freight business customer access; availability varies by country and product'},
  {id:'hapag_lloyd', name:'Hapag-Lloyd APIs', modes:['sea'], variables:['HAPAG_LLOYD_CLIENT_ID','HAPAG_LLOYD_CLIENT_SECRET','HAPAG_LLOYD_CUSTOMER_CODE'], docs:'https://developer.hlag.com/', access:'API registration and customer authorization; verify individual product access'},
  {id:'cma_cgm', name:'CMA CGM APIs', modes:['sea'], variables:['CMA_CGM_CLIENT_ID','CMA_CGM_CLIENT_SECRET','CMA_CGM_CUSTOMER_CODE'], docs:'https://api-portal.cma-cgm.com/', access:'API portal registration and customer/product access; verify booking permissions'}
];

function hasEnv(env, name) { return Boolean(String(env?.[name] || '').trim()); }

export function getConnectorCatalog(env = process.env) {
  return {
    freeOpportunitySources: FREE_JOB_SOURCES.map(x => ({...x, status:'implemented_read_only', configured:true, needsVariables:false, applicationSubmission:false})),
    optionalSearch: OPTIONAL_SEARCH.map(x => ({...x, status:hasEnv(env,x.env)?'key_present_test_required':'optional_key_missing', configured:hasEnv(env,x.env), needsVariables:true, execution:'search_only'})),
    shipping: CARRIERS.map(x => ({...x, status:'adapter_not_implemented', configured:false, credentialsPresent:x.variables.every(v=>hasEnv(env,v)), needsVariables:true, canQuote:false, canBook:false, canCreateLabel:false, note:'المتغيرات هنا مواصفة إعداد مستقبلية؛ إضافتها وحدها لا تفعّل API. يلزم تنفيذ موصل الناقل واختباره بعد منح الحساب صلاحية الوصول.'}))
  };
}

export function getConnectorEnvironmentTemplate() {
  return {
    free_opportunity_apis: [],
    optional_search: ['SERPER_API_KEY','EXA_API_KEY','FIRECRAWL_API_KEY'],
    shipping_reserved_not_active: [...new Set(CARRIERS.flatMap(x=>x.variables))]
  };
}
