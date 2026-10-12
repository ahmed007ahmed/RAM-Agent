const CATEGORIES = Object.freeze({
  DESIGN:'companies seeking freelance CAD engineering architectural design website development landing pages graphic design advertising project request',
  FREIGHT:Object.freeze([
    Object.freeze({leadSide:'SHIPPER',query:'shipper cargo owner publicly requests freight shipping quote RFQ cargo transport sea air road container shipment request'}),
    Object.freeze({leadSide:'CARRIER',query:'freight forwarder shipping company carrier agent referral partner program commission independent sales agent cargo logistics partnership'})
  ]),
  SOURCING:Object.freeze([
    Object.freeze({leadSide:'BUYER',query:'public buyer purchase request RFQ request for quotation importer seeking to buy product quantity sourcing procurement tender'}),
    Object.freeze({leadSide:'SUPPLIER',query:'manufacturer wholesaler exporter supplier product catalog distributor wholesale sales agent referral commission partnership'})
  ]),
  OTHER:'remote freelance Arabic translation research writing client request paid project'
});

export const LEAD_SEARCH_CATEGORIES=CATEGORIES;

export function buildLeadSearches(category, extraQuery='') {
  const configured=CATEGORIES[category];
  if(!configured)return [];
  const items=Array.isArray(configured)?configured:[{query:configured,leadSide:null}];
  const extra=String(extraQuery||'').trim().slice(0,300);
  return items.map(item=>({
    ...item,
    query:[item.query,extra].filter(Boolean).join(' ')
  }));
}

export function classifyLeadType(category, leadSide) {
  if(category==='FREIGHT'||category==='SOURCING')return leadSide;
  if(category==='DESIGN')return 'SERVICE_BUYER';
  return 'REMOTE_WORK_REQUEST';
}
