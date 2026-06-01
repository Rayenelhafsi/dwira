import { searchAvailableProperties } from "../src/services/propertySearch.service.js";
const rows = await searchAvailableProperties({ location:'Kelibia', guests:6, budget:null, startDate:'2026-08-14', endDate:'2026-08-18', nearBeach:false, pool:false, parking:false });
console.log(JSON.stringify(rows.map(r=>({id:r.id,title:r.title})),null,2));
