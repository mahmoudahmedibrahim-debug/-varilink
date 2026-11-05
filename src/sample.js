// Fictional sample project. Names, quantities and rates are invented.
window.sampleState = function () {
  const E = window.Engine;
  const boq1 = [
    ['F-101','Ceramic floor tiles 60x60 including adhesive and grout','m2',4200,620,'Finishes'],
    ['F-102','Ceramic wall tiles to wet areas','m2',3100,560,'Finishes'],
    ['F-103','Emulsion paint to internal walls, three coats','m2',18500,95,'Finishes'],
    ['C-201','Reinforced concrete to boundary wall footing','m3',320,5400,'Civil'],
    ['C-202','Block work 200 mm to boundary wall','m2',2600,640,'Civil'],
    ['C-203','Cement plaster to boundary wall','m2',5200,180,'Civil'],
    ['M-301','UPVC drainage pipe 110 mm','m',1450,410,'Mechanical'],
    ['E-401','LED downlight 12 W, supply and install','No',860,950,'Electrical'],
    ['E-402','Power socket outlet, twin','No',1240,380,'Electrical']
  ].map(([code,desc,unit,qty,rate,discipline])=>({code,desc,unit,qty,rate,discipline}));
  const boq2 = [
    ['R-101','Asphalt wearing course 50 mm','m2',12000,310,'Civil'],
    ['R-102','Interlock pavers to walkways','m2',6400,540,'Civil'],
    ['W-201','HDPE water main 160 mm','m',2300,1150,'Mechanical'],
    ['E-301','Street light pole 6 m with LED head','No',140,28500,'Electrical']
  ].map(([code,desc,unit,qty,rate,discipline])=>({code,desc,unit,qty,rate,discipline}));
  const docs = names => names.map(n=>({category:n[0],name:n[1],rev:n[2]||'',date:n[3]||''}));
  const k1 = { id:'k1', code:'PK-01', name:'Villas Zone A', contractor:'Cedar Build (fictional)',
    contract:{type:'Lump Sum',typeOther:'',markupPct:30,designFeesIncluded:'No',iftIsIfc:'No',geotech:'Yes',vatPct:14,pricingClause:'Particular Conditions 13.3: BOQ rates first, then similar items, then fair rates with OH&P.',paymentClause:'Particular Conditions 14.3: monthly IPC, 5% retention.',notes:''},
    docs:docs([['Contract','Contract agreement PK-01.pdf','0','2026-01-12'],['Particular Conditions','PC extract variations and payment.pdf','0','2026-01-12'],['Stamped BOQ','PK-01 stamped BOQ.xlsx','0','2026-01-12'],['IFT drawings','IFT architectural set.pdf','B','2025-11-02'],['IFC drawings','IFC architectural set.pdf','C','2026-03-20'],['Geotechnical report','Soil report Zone A.pdf','0','2025-08-15']]),
    boq:boq1, changes:[] };
  const k2 = { id:'k2', code:'PK-02', name:'Infrastructure Works', contractor:'Delta Civil (fictional)',
    contract:{type:'Re-measured',typeOther:'',markupPct:30,designFeesIncluded:'No',iftIsIfc:'Yes',geotech:'Yes',vatPct:14,pricingClause:'Particular Conditions 13.3: quantities re-measured from executed work.',paymentClause:'Monthly IPC by measured quantities.',notes:''},
    docs:docs([['Contract','Contract agreement PK-02.pdf','0','2026-02-02'],['Stamped BOQ','PK-02 stamped BOQ.xlsx','0','2026-02-02']]),
    boq:boq2, changes:[] };

  k1.changes.push({ id:'CE-PK01-001', title:'Clubhouse flooring upgrade from ceramic to porcelain', description:'Replace all ceramic floor tiles with 80x80 porcelain following the revised interior package.', reason:'Design change', reasonRef:'Client email 12-Mar-2026', discipline:'Finishes', abortive:{status:'No',by:'',ref:'',notes:''}, si:[{no:'SI-014',date:'2026-04-05',ref:'SI letter 014'}],
    lines:[
      {id:'l1',action:'Omission',scope:'full',boqCode:'F-101',takeoffQty:'',contractorQty:4200,contractorRate:620},
      {id:'l2',action:'Addition',desc:'Porcelain floor tiles 80x80 including adhesive and grout',unit:'m2',discipline:'Finishes',replacesCode:'F-101',takeoffQty:4050,rateSource:'New',quoteRef:'Supplier quote Q-221',breakdown:[{cat:'Supply',item:'Porcelain tile',unit:'m2',qty:1.05,rate:560},{cat:'Supply',item:'Adhesive and grout',unit:'m2',qty:1,rate:95},{cat:'Install',item:'Installation',unit:'m2',qty:1,rate:130}],contractorQty:4200,contractorRate:1010}
    ],
    stages:[
      {kind:'DCR',no:'DCR-007',date:'2026-03-15',status:'Approved',amount:2050000,approved:'',letterRef:'DCR letter 007',deltaReason:''},
      {kind:'CR',no:'CR-012',date:'2026-03-29',status:'Approved',amount:2180000,approved:'',letterRef:'',deltaReason:'Tile size changed to 80x80 after the supplier quote.'},
      {kind:'VO',no:'VO-005',date:'2026-05-10',status:'Approved',amount:2152080,approved:2100000,letterRef:'VO letter 005',deltaReason:'Rate build-up finalised against quote Q-221.'}
    ]});
  k1.changes.push({ id:'CE-PK01-002', title:'Wall tile height reduced in guest bathrooms', description:'Reduce wall tiling to 1.2 m in guest bathrooms and paint the area above.', reason:'Cost saving', reasonRef:'Cost saving workshop 02', discipline:'Finishes', abortive:{status:'No',by:'',ref:'',notes:''}, si:[],
    lines:[
      {id:'l3',action:'Omission',scope:'partial',boqCode:'F-102',takeoffQty:640,contractorQty:600,contractorRate:560},
      {id:'l4',action:'Addition',desc:'Emulsion paint to tiled area removed',unit:'m2',discipline:'Finishes',takeoffQty:640,rateSource:'BOQ',rateRef:'F-103',contractorQty:640,contractorRate:110}
    ],
    stages:[{kind:'DCR',no:'DCR-009',date:'2026-07-02',status:'Approved',amount:-295000,approved:'',letterRef:'',deltaReason:''},{kind:'CR',no:'CR-016',date:'2026-07-20',status:'Pending Client',amount:-297600,approved:'',letterRef:'',deltaReason:'Measured from the revised bathroom drawings.'}]});
  k1.changes.push({ id:'CE-PK01-003', title:'Boundary wall relocated along the north plot line', description:'Move 180 m of boundary wall 2 m inward. Part of the wall is already built and has to be demolished.', reason:'Contractor notice', reasonRef:'Notice letter COR-118', discipline:'Civil', abortive:{status:'Yes',by:'Supervision consultant',ref:'Site memo 044',notes:'Blockwork built before the instruction.'}, si:[{no:'SI-021',date:'2026-08-11',ref:'SI letter 021'}],
    lines:[
      {id:'l5',action:'Omission',scope:'partial',boqCode:'C-202',takeoffQty:540,executedQty:210,contractorQty:540,contractorRate:640},
      {id:'l6',action:'Omission',scope:'partial',boqCode:'C-203',takeoffQty:1080,executedQty:0,contractorQty:1080,contractorRate:180},
      {id:'l7',action:'Addition',desc:'Block work 200 mm to relocated wall',unit:'m2',discipline:'Civil',takeoffQty:556,rateSource:'BOQ',rateRef:'C-202',contractorQty:600,contractorRate:640},
      {id:'l8',action:'Addition',desc:'Cement plaster to relocated wall',unit:'m2',discipline:'Civil',takeoffQty:1112,rateSource:'BOQ',rateRef:'C-203',contractorQty:1200,contractorRate:180},
      {id:'l9',action:'Addition',desc:'Demolish executed block work and remove debris',unit:'m2',discipline:'Civil',takeoffQty:210,rateSource:'Derived',rateRef:'C-202',factor:0.3,derivation:'Demolition taken as 30% of the block work rate',contractorQty:210,contractorRate:320}
    ],
    stages:[{kind:'NoV',no:'NoV-006',date:'2026-08-04',status:'Pending AAA',amount:0,approved:'',letterRef:'COR-118',deltaReason:''}]});
  k2.changes.push({ id:'CE-PK02-001', title:'Walkway finish changed from pavers to asphalt in Zone C', description:'Omit interlock pavers from Zone C walkways and use asphalt instead.', reason:'Value engineering', reasonRef:'VE proposal 03', discipline:'Civil', abortive:{status:'Not applicable',by:'',ref:'',notes:''}, si:[],
    lines:[
      {id:'l10',action:'Omission',scope:'partial',boqCode:'R-102',takeoffQty:2150,contractorQty:2150,contractorRate:540},
      {id:'l11',action:'Addition',desc:'Asphalt wearing course to walkways',unit:'m2',discipline:'Civil',takeoffQty:2085,rateSource:'BOQ',rateRef:'R-101',replacesCode:'R-102',contractorQty:2150,contractorRate:310}
    ],
    stages:[{kind:'CR',no:'CR-003',date:'2026-06-14',status:'Pending Consultant',amount:-514650,approved:'',letterRef:'',deltaReason:''}]});
  k2.changes.push({ id:'CE-PK02-002', title:'Street lighting omitted from service road', description:'Omit poles along the service road.', reason:'Client email', reasonRef:'Client email 03-Sep-2026', discipline:'Electrical', abortive:{status:'No',by:'',ref:'',notes:''}, si:[],
    lines:[{id:'l12',action:'Omission',scope:'partial',boqCode:'E-301',takeoffQty:150}],
    stages:[{kind:'DCR',no:'DCR-002',date:'2026-09-06',status:'Pending AAA',amount:-4275000,approved:'',letterRef:'',deltaReason:''}]});
  return { projects:[{ id:'p1', name:'Palm Grove Residences', client:'Sample Developer', currency:'EGP', sample:true, packages:[k1,k2] }] };
};
