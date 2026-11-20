(() => {
  'use strict';
  const $ = id => document.getElementById(id), form = $('place-form');
  if (!form) return;
  if (/(^|\.)translate\.goog$/i.test(location.hostname)) {
    form.hidden = true;
    for (const control of form.elements) control.disabled = true;
    form.addEventListener('submit', event => event.preventDefault());
    const quickForm = $('quick-pin-form');
    if (quickForm) { quickForm.hidden = true; for (const control of quickForm.elements) control.disabled = true; quickForm.addEventListener('submit', event => event.preventDefault()); }
    const workspace = document.querySelector('.map-workspace'); if (workspace) workspace.hidden = true;
    const dialog = form.closest('dialog'); if (dialog) dialog.hidden = true;
    const notice = document.createElement('section'); notice.className = 'section note translated-form-notice';
    const heading = document.createElement('h2'); heading.textContent = 'Open the original website to use the map';
    const explanation = document.createElement('p'); explanation.textContent = 'The map and place form work on the original Ready SETCO page. You can use your browser’s Translate option there to read the page in another language.';
    const link = document.createElement('a'); link.className = 'button primary'; link.textContent = 'Open the original local map';
    link.href = 'https://ready-setco.auraofintelligence.workers.dev/map.html'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
    notice.append(heading, explanation, link);
    const introduction = document.querySelector('.map-intro'); if (introduction) introduction.after(notice); else form.before(notice);
    return;
  }
  const field = name => form.elements.namedItem(name);
  const iconCatalog=window.READY_MAP_ICONS||{icons:[],sheets:{},columns:4,rows:4};
  const iconById=new Map(iconCatalog.icons.map(icon=>[icon.id,icon]));
  const categoryIcons={business:'business',bus_stop:'bus_stop',picnic:'picnic',seat:'seat',toilet:'toilet',club:'community_club',beach:'beach',water:'water',other:'other'};
  const apiBase = (window.READY_SETCO?.apiBase || '').replace(/\/$/, '');
  const draftKey = 'ready-setco-place-draft-v1';
  const categories = [
    ['all','All places','Place','⌖','#6638a6'],
    ['business','Businesses','Business','▣','#7d3dbb'],
    ['bus_stop','Bus stops','Bus stop / shelter','▥','#237c9a'],
    ['picnic','Picnic places','Picnic place / equipment','♧','#277947'],
    ['seat','Seats','Seat / bench','▰','#a16a15'],
    ['toilet','Toilets','Toilet','▤','#4762a9'],
    ['club','Clubs','Club / community group','◎','#ab4872'],
    ['beach','Beaches','Beach / beach access','≈','#248482'],
    ['water','Water','Drinking water','◊','#2b79b0'],
    ['other','Other places','Another useful place','✧','#646b7e'],
  ].map(([id,name,singular,symbol,colour]) => ({id,name,singular,symbol,colour}));
  const categoryById = new Map(categories.map(c => [c.id,c]));
  const facilityNames = {shelter:'Shelter',seating:'Seating',picnic_table:'Picnic table',bbq:'Barbecue',toilet:'Toilet',drinking_water:'Drinking water',shade:'Shade',accessible_toilet:'Accessible toilet',baby_change:'Baby change',power:'Power',dog_friendly:'Dogs permitted'};
  const areas = {minjerribah:[153.38,-27.76,153.60,-27.37],smbi:[153.32,-27.75,153.46,-27.54],redlands:[153.13,-27.78,153.61,-27.34],all:null};
  const islandFrame=[[-27.742,153.391],[-27.387,153.550]];
  let selectedCategory='all',features=[],metadata={total:0,offset:0,limit:200,hasMore:false},selectedFeature=null;
  let map=null,markerLayer=null,draftMarker=null,choosingPosition=false,tileErrors=0,baseLayer=null,baseView='satellite',areaOverview=null;
  let locationMarker=null,locationCircle=null,locationSequence=0,expanded=false,showExpandedList=false,inertBackground=[],choosingFromEditor=false;
  let quickSending=false,quickPayload=null;
  const mapLayout=$('map-layout');
  mapLayout.append($('place-dialog'));
  let searchTimer=null,loadSequence=0,loadController=null,submissionId=crypto.randomUUID(),correction=null,sent=false,sending=false,lastDialogOpener=null,returnDialogFocus=true;
  function notice(node,text,kind){node.textContent=text;if(kind)node.dataset.kind=kind;else delete node.dataset.kind;}
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  async function apiRequest(path,options={}){
    const controller=options.signal?null:new AbortController(),timer=controller?setTimeout(()=>controller.abort(),15000):null;
    try{
      const response=await fetch(apiBase+path,{...options,credentials:'omit',signal:options.signal||controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result)throw new Error(result?.error||'The place register could not confirm this request. Please try again.');
      return result;
    }finally{if(timer)clearTimeout(timer);}
  }
  function coords(feature){const p=feature?.geometry?.coordinates;return Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p:null;}
  function category(id){return categoryById.get(id)||categoryById.get('other');}
  function featureId(feature){return String(feature?.properties?.id||feature?.id||'');}
  function bbox(){return areas[$('map-area').value]||null;}
  function visibleFeatures(){
    const q=$('place-search').value.trim().toLocaleLowerCase(),b=bbox();
    return features.filter(f=>{const p=f.properties||{},c=coords(f);return c&&(selectedCategory==='all'||p.category===selectedCategory)&&(!b||(c[0]>=b[0]&&c[0]<=b[2]&&c[1]>=b[1]&&c[1]<=b[3]))&&(!q||[p.name,p.description,p.locationDescription].join(' ').toLocaleLowerCase().includes(q));});
  }
  function day(value){const d=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'Not recorded';}
  function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  function renderCategories(){
    for(const c of categories){
      const button=el('button',undefined,'map-category');button.type='button';button.dataset.category=c.id;button.setAttribute('aria-pressed',String(c.id===selectedCategory));button.style.setProperty('--category-colour',c.colour);
      const icon=el('span',c.symbol,'map-category-symbol');icon.setAttribute('aria-hidden','true');button.append(icon,document.createTextNode(c.name));
      button.addEventListener('click',()=>{if(c.id===selectedCategory)return;selectedCategory=c.id;for(const b of $('map-categories').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));closeDetail();loadPlaces();});
      $('map-categories').append(button);
    }
  }
  function iconArt(id){
    const icon=iconById.get(id);if(!icon)return null;
    const sheet=iconCatalog.sheets[icon.sheet];if(!sheet)return null;
    const art=el('span',undefined,'map-art-icon');art.setAttribute('aria-hidden','true');
    art.style.backgroundImage='url("'+sheet+'")';art.style.backgroundSize=(iconCatalog.columns*100)+'% '+(iconCatalog.rows*100)+'%';
    art.style.backgroundPosition=(icon.column*100/(iconCatalog.columns-1))+'% '+(icon.row*100/(iconCatalog.rows-1))+'%';return art;
  }
  function placeArt(feature){return iconArt(feature.properties?.iconId)||iconArt(categoryIcons[feature.properties?.category]||'other');}
  function updateSelectedIcon(){
    const id=field('iconId').value,icon=iconById.get(id),display=$('selected-icon');display.replaceChildren();
    const art=iconArt(id||categoryIcons[field('category').value]||'other');if(art)display.append(art);
    display.append(el('span',icon?icon.label:'Category icon'));$('default-icon').setAttribute('aria-pressed',String(!id));
    $('icon-cultural-note').hidden=id!=='indigenous_culture';
    for(const button of $('icon-picker-grid').querySelectorAll('[data-icon-id]'))button.setAttribute('aria-pressed',String(button.dataset.iconId===id));
  }
  function chooseIcon(id){
    if(id&&!iconById.has(id))return;field('iconId').value=id;
    if(id&&!field('category').value){field('category').value=iconById.get(id).category;updateCategoryFields();}
    updateSelectedIcon();$('icon-chooser').hidden=true;$('choose-icon').setAttribute('aria-expanded','false');$('choose-icon').focus({preventScroll:true});
  }
  function renderIconPicker(){
    const group=$('icon-group').value,q=$('icon-search').value.trim().toLocaleLowerCase(),grid=$('icon-picker-grid');grid.replaceChildren();
    const icons=iconCatalog.icons.filter(icon=>(group==='all'||icon.sheet===group)&&(!q||[icon.label,icon.id].join(' ').toLocaleLowerCase().includes(q)));
    for(const icon of icons){const button=el('button',undefined,'icon-picker-option');button.type='button';button.dataset.iconId=icon.id;button.setAttribute('aria-pressed',String(field('iconId').value===icon.id));const art=iconArt(icon.id);if(art)button.append(art);button.append(el('span',icon.label));button.addEventListener('click',()=>chooseIcon(icon.id));grid.append(button);}
    notice($('icon-picker-message'),icons.length?'':'No matching icons. Try a different word or group.');
  }
  function markerIcon(feature,selected){
    const c=category(feature.properties?.category);
    const art=placeArt(feature);if(art){const pin=el('span',undefined,'map-picture-pin'+(selected?' is-selected':''));pin.style.setProperty('--category-colour',c.colour);pin.append(art);return window.L.divIcon({className:'map-picture-pin-wrap',html:pin.outerHTML,iconSize:[52,60],iconAnchor:[26,60]});}
    return window.L.divIcon({className:'map-pin-wrap',html:'<span class="map-pin'+(selected?' is-selected':'')+'" style="--category-colour:'+c.colour+'"><span aria-hidden="true">'+c.symbol+'</span></span>',iconSize:[44,48],iconAnchor:[22,44]});
  }
  function renderMarkers(visible=visibleFeatures()){
    if(!map||!markerLayer)return;markerLayer.clearLayers();
    for(const f of visible){const c=coords(f);if(!c)continue;const marker=window.L.marker([c[1],c[0]],{icon:markerIcon(f,featureId(f)===featureId(selectedFeature)),title:String(f.properties?.name||'Place'),keyboard:true}).on('click',()=>openPlace(f,false));markerLayer.addLayer(marker);}
  }
  function renderPlaces(){
    const visible=visibleFeatures(),list=$('place-list');list.replaceChildren();
    for(const f of visible){
      const p=f.properties,c=category(p.category),item=document.createElement('li'),button=el('button',undefined,'place-list-button');button.type='button';button.setAttribute('aria-pressed',String(featureId(f)===featureId(selectedFeature)));
      const icon=el('span',undefined,'place-list-icon');icon.style.setProperty('--category-colour',c.colour);icon.setAttribute('aria-hidden','true');const art=placeArt(f);if(art)icon.append(art);else icon.textContent=c.symbol;
      const copy=el('span',undefined,'place-list-copy');copy.append(el('strong',p.name||'Unnamed place'),el('small',c.singular));if(p.locationDescription)copy.append(el('span',p.locationDescription,'place-list-note'));button.append(icon,copy);button.addEventListener('click',()=>openPlace(f,true));item.append(button);list.append(item);
    }
    const count=metadata.total===1?'1 place':metadata.total+' places';$('place-count').textContent=metadata.hasMore?visible.length+' shown · '+count:count;$('more-places').hidden=!metadata.hasMore;
    notice($('places-message'),visible.length?'':features.length?'No places match these filters. Try another kind of place or a different area.':'No published places in this view yet. Add something you know and help this map grow.');
    renderMarkers(visible);
  }
  function zoomToArea(){
    if(!map)return;const b=bbox();
    if($('map-area').value==='minjerribah'){
      const creditHeight=map.attributionControl?.getContainer()?.offsetHeight||0;
      map.fitBounds(islandFrame,{paddingTopLeft:[8,8],paddingBottomRight:[8,creditHeight+8],animate:false});
    }
    else if(b)map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[22,22],animate:false});
    else{const points=visibleFeatures().map(coords).filter(Boolean);if(points.length)map.fitBounds(points.map(p=>[p[1],p[0]]),{padding:[35,35],maxZoom:16,animate:false});else map.setView([-27.56,153.47],11);}
    areaOverview={center:map.getCenter(),zoom:map.getZoom()};
  }
  function resizeMap(){
    if(!map)return;const current=map,keepOverview=areaOverview&&map.getCenter().equals(areaOverview.center)&&Math.abs(map.getZoom()-areaOverview.zoom)<.00001;
    requestAnimationFrame(()=>{if(map!==current)return;map.invalidateSize({animate:false});if(keepOverview)zoomToArea();});
  }
  function setExpandedList(value){
    showExpandedList=Boolean(value);mapLayout.classList.toggle('show-place-list',showExpandedList);
    $('toggle-map-list').setAttribute('aria-expanded',String(showExpandedList));
    $('map-results').hidden=expanded&&!showExpandedList;resizeMap();
  }
  function setExpanded(value){
    expanded=Boolean(value);mapLayout.classList.toggle('is-expanded',expanded);document.body.classList.toggle('map-expanded',expanded);
    $('expand-map').textContent=expanded?'Back to page':'Full screen';$('expand-map').setAttribute('aria-pressed',String(expanded));$('toggle-map-list').hidden=!expanded;
    if(expanded){
      mapLayout.setAttribute('role','dialog');mapLayout.setAttribute('aria-modal','true');mapLayout.setAttribute('aria-label','Full screen community map');
      inertBackground=[];let branch=mapLayout;
      while(branch.parentElement){for(const sibling of branch.parentElement.children){if(sibling!==branch&&!sibling.inert){inertBackground.push(sibling);sibling.inert=true;}}branch=branch.parentElement;if(branch===document.body)break;}
      setExpandedList(false);
    }else{
      for(const node of inertBackground)node.inert=false;inertBackground=[];
      mapLayout.removeAttribute('role');mapLayout.removeAttribute('aria-modal');mapLayout.removeAttribute('aria-label');$('map-results').hidden=false;
      mapLayout.classList.remove('show-place-list');$('toggle-map-list').setAttribute('aria-expanded','false');showExpandedList=false;
    }
    resizeMap();if(!expanded)$('expand-map').focus({preventScroll:true});
  }
  function setBaseView(view){
    if(!map)return;
    const previous=baseLayer;baseView=view==='satellite'?'satellite':'road';tileErrors=0;
    const imagery=baseView==='satellite';
    baseLayer=window.L.tileLayer(imagery?'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/tile/{z}/{y}/{x}':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:20,maxNativeZoom:imagery?20:19,
      attribution:imagery?'Imagery &copy; <a href="https://www.data.qld.gov.au/dataset/queensland-imagery-latest-state-program-public-basemap-service">State of Queensland</a>; &copy; Planet Labs Netherlands B.V. (Planet / Geoplex), 2026':'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    });
    const current=baseLayer;
    current.on('tileerror',()=>{if(current!==baseLayer)return;tileErrors++;notice($('map-status'),imagery?'Some imagery could not load here. Try Map view or another zoom level.':'Some map tiles could not load. The place list is still available.');});
    current.on('load',()=>{if(current!==baseLayer||tileErrors||choosingPosition)return;notice($('map-status'),imagery?'Satellite / aerial view ready. Capture dates vary.':'Map ready. Select a place to see its details.');});
    if(previous)map.removeLayer(previous);current.addTo(map);
    $('map-road').setAttribute('aria-pressed',String(!imagery));$('map-satellite').setAttribute('aria-pressed',String(imagery));$('map-layer-note').hidden=!imagery;
    notice($('map-status'),imagery?'Loading Queensland aerial / satellite imagery…':'Loading the road map…');
  }
  function clearLocation(){
    locationSequence++;if(map){if(locationMarker)map.removeLayer(locationMarker);if(locationCircle)map.removeLayer(locationCircle);}
    locationMarker=null;locationCircle=null;$('find-me').disabled=false;$('clear-location').hidden=true;notice($('map-location-status'),'');
  }
  function findLocation(){
    if(!map)return;
    if(!navigator.geolocation){notice($('map-location-status'),'This device cannot provide a location. You can still browse the map.','error');return;}
    clearLocation();
    const request=++locationSequence;$('find-me').disabled=true;notice($('map-location-status'),'Asking your device for your location…');
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==locationSequence||!map)return;$('find-me').disabled=false;
      const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -90||latitude>90||longitude< -180||longitude>180){notice($('map-location-status'),'The device returned an unreadable location. Please try again.','error');return;}
      if(locationMarker)map.removeLayer(locationMarker);if(locationCircle)map.removeLayer(locationCircle);
      locationMarker=window.L.marker([latitude,longitude],{title:'Your approximate location',keyboard:false,icon:window.L.divIcon({className:'map-location-dot-wrap',html:'<span class="map-location-dot" aria-hidden="true"></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);
      if(Number.isFinite(accuracy)&&accuracy>0)locationCircle=window.L.circle([latitude,longitude],{radius:accuracy,color:'#126ca6',weight:1,fillColor:'#53c6f1',fillOpacity:.15,interactive:false}).addTo(map);
      map.setView([latitude,longitude],Math.min(17,map.getZoom()<15?16:map.getZoom()),{animate:false});$('clear-location').hidden=false;
      notice($('map-location-status'),'Your approximate location'+(Number.isFinite(accuracy)&&accuracy>0?' · accuracy about '+Math.round(accuracy)+' metres':'')+'. It has not been added to the place register.');
    },error=>{
      if(request!==locationSequence||!map)return;$('find-me').disabled=false;
      notice($('map-location-status'),error.code===1?'Location permission was not granted. You can allow it in your browser settings or keep browsing.':error.code===3?'Your device took too long to find a location. Please try again.':'Your location could not be found. Check your device location settings and try again.','error');
    },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  }
  function loadMap(){
    if(map)return;if(!window.L?.map){notice($('map-status'),'The map background is unavailable. You can still use the place list or enter a location manually.','error');return;}
    $('map-placeholder').hidden=true;$('map-canvas').hidden=false;$('remove-map').hidden=false;
    map=window.L.map('map-canvas',{scrollWheelZoom:false,tapHold:true,zoomSnap:0}).setView([-27.56,153.47],11);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    markerLayer=window.L.layerGroup().addTo(map);$('map-toolbar').hidden=false;setBaseView(baseView);
    map.on('click',event=>{
      if(quickSending||$('place-dialog').open)return;
      const detailed=choosingPosition&&choosingFromEditor;
      if(!detailed&&($('quick-pin').hidden||quickPayload))prepareEditor();
      setPosition(event.latlng.lat,event.latlng.lng,'Pin chosen on the map.');setChoosing(false);
      if(detailed)openEditor({preserve:true});else showQuickPin();
    });
    zoomToArea();renderMarkers();renderDraftMarker();notice($('map-status'),choosingPosition?'Tap the map to choose the place.':'Loading the map background…');$('map-stage').classList.toggle('is-choosing',choosingPosition);
  }
  function unloadMap(){if(!map)return;if(expanded)setExpanded(false);clearLocation();map.remove();map=null;markerLayer=null;draftMarker=null;baseLayer=null;$('map-toolbar').hidden=true;$('map-layer-note').hidden=true;$('map-canvas').hidden=true;$('map-placeholder').hidden=false;$('remove-map').hidden=true;notice($('map-status'),'Map background hidden. The place list is still available.');$('load-map').focus();}
  async function loadPlaces(more=false){
    const sequence=++loadSequence;if(loadController)loadController.abort();const controller=new AbortController();loadController=controller;const timeout=setTimeout(()=>controller.abort(),15000);
    $('retry-places').hidden=true;$('more-places').disabled=true;notice($('places-message'),more?'Loading more places…':'Loading the local place register…');
    const params=new URLSearchParams({limit:'200',offset:String(more?metadata.offset+metadata.limit:0)});
    if(selectedCategory!=='all')params.set('category',selectedCategory);const q=$('place-search').value.trim();if(q)params.set('search',q);const b=bbox();if(b)params.set('bbox',b.join(','));
    try{
      const result=await apiRequest('/api/map/places?'+params,{signal:controller.signal});if(sequence!==loadSequence)return;
      if(result.type!=='FeatureCollection'||!Array.isArray(result.features))throw new Error('The place register returned an unreadable list. Please try again.');
      const known=new Map((more?features:[]).map(f=>[featureId(f),f]));for(const f of result.features)if(coords(f)&&f.properties)known.set(featureId(f),f);features=[...known.values()];
      metadata={total:Number(result.metadata?.total??features.length),limit:Number(result.metadata?.limit??200),offset:Number(result.metadata?.offset??0),hasMore:Boolean(result.metadata?.hasMore)};renderPlaces();
    }catch(error){if(sequence!==loadSequence)return;notice($('places-message'),error.name==='AbortError'?'The place register took too long to reply. Please try again.':error.message||'The place register is unavailable. Please try again.','error');$('retry-places').hidden=false;$('place-count').textContent='Places not loaded';$('more-places').hidden=true;}
    finally{clearTimeout(timeout);if(sequence===loadSequence)$('more-places').disabled=false;}
  }
  function fact(label,value,url){const row=document.createElement('div'),dd=el('dd');row.append(el('dt',label));if(url){const a=el('a',value);a.href=url;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);}else dd.textContent=value;row.append(dd);$('place-detail-facts').append(row);}
  function updateDirections(){
    if(!selectedFeature)return;const c=coords(selectedFeature);if(!c)return;
    const destination=c[1]+','+c[0],url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',destination);
    const mode=$('directions-mode').value;if(['walking','driving','bicycling','transit'].includes(mode))url.searchParams.set('travelmode',mode);
    $('place-directions').href=url.href;
    const point=new URL('https://www.google.com/maps/search/');point.searchParams.set('api','1');point.searchParams.set('query',destination);$('place-google-map').href=point.href;
  }
  function openPlace(feature,moveMap){
    selectedFeature=feature;const p=feature.properties,c=coords(feature);$('place-detail-category').textContent=category(p.category).singular;$('place-detail-title').textContent=p.name;$('place-detail-description').textContent=p.description||'No additional note has been recorded yet.';$('place-detail-facts').replaceChildren();
    if(p.locationDescription)fact('Finding it',p.locationDescription);
    fact('Access',({public:'Public access',customers:'Customers / members',permission:'Permission needed',unknown:'Not checked'})[p.access]||'Not checked');
    fact('Wheelchair / step-free access',({yes:'Accessible access observed',no:'Access barrier observed',unknown:'Not checked'})[p.wheelchair]||'Not checked');
    if(p.category==='bus_stop')fact('Bus stop sign',({marked:'Marked / signed',unmarked:'Unmarked local stop',unknown:'Not checked'})[p.stopMarking]||'Not checked');
    fact('Source',({firsthand:'First-hand observation',website:'Public website',existing_record:'Existing record',map_pin:'Map pin · details to be checked',other:'Another source'})[p.sourceType]||'Not recorded',safeUrl(p.sourceUrl));
    if(p.observedOn)fact('Observed',day(p.observedOn));if(p.updatedAt)fact('Record updated',day(p.updatedAt));if(p.publicCredit)fact('Contributed by',p.publicCredit);
    $('place-detail-facilities').replaceChildren();for(const f of p.facilities||[])if(facilityNames[f])$('place-detail-facilities').append(el('span',facilityNames[f]));
    $('place-external-map').href='https://www.openstreetmap.org/?mlat='+c[1]+'&mlon='+c[0]+'#map=18/'+c[1]+'/'+c[0];
    updateDirections();if(expanded){setExpandedList(true);$('map-results').scrollTop=0;}
    $('place-detail').hidden=false;$('place-list').hidden=true;$('more-places').hidden=true;$('places-message').hidden=true;renderMarkers();if(map&&moveMap)map.setView([c[1],c[0]],Math.max(map.getZoom(),16),{animate:false});$('place-detail-title').focus({preventScroll:expanded});
  }
  function closeDetail(){selectedFeature=null;$('place-detail').hidden=true;$('place-list').hidden=false;$('places-message').hidden=false;$('more-places').hidden=!metadata.hasMore;renderPlaces();}
  function setChoosing(value){choosingPosition=value;$('map-position-prompt').hidden=!value;$('map-stage').classList.toggle('is-choosing',value);$('add-map-pin').setAttribute('aria-pressed',String(value));$('add-map-pin').textContent=value?'Cancel pin':'Drop pin';}
  function cancelChoosing(){const returnToEditor=choosingFromEditor;setChoosing(false);if(returnToEditor)openEditor({preserve:true});else{$('add-map-pin').focus({preventScroll:true});notice($('map-status'),'Pin cancelled. You can keep exploring the map.');}}
  function setPosition(lat,lon,message){field('latitude').value=Number(lat).toFixed(6);field('longitude').value=Number(lon).toFixed(6);notice($('position-status'),message||'Location selected. Check that it marks the place itself.');renderDraftMarker();}
  function renderDraftMarker(){
    if(!map)return;if(draftMarker){map.removeLayer(draftMarker);draftMarker=null;}
    const lat=Number(field('latitude').value),lon=Number(field('longitude').value);if(!field('latitude').value||!field('longitude').value||!Number.isFinite(lat)||!Number.isFinite(lon))return;
    draftMarker=window.L.marker([lat,lon],{icon:window.L.divIcon({className:'map-pin-wrap',html:'<span class="map-pin-draft" aria-hidden="true">＋</span>',iconSize:[44,44],iconAnchor:[22,22]}),title:'Your chosen place location',keyboard:false}).addTo(map);
  }
  function draftExists(){try{return Boolean(localStorage.getItem(draftKey));}catch{return false;}}
  function showQuickPin(){
    const preserveName=!$('quick-pin').hidden&&!quickPayload;
    if(!preserveName)$('quick-pin-name').value=field('name').value;
    quickPayload=null;$('quick-pin').hidden=false;$('map-stage').classList.add('quick-pin-open');
    $('map-stage').style.setProperty('--map-credit-height',(map?.attributionControl?.getContainer()?.offsetHeight||30)+'px');
    for(const control of $('quick-pin-form').elements)control.disabled=false;
    $('close-quick-pin').disabled=false;$('send-quick-pin').textContent='Send pin';$('quick-pin-status').hidden=true;
    $('send-quick-pin').focus({preventScroll:true});$('quick-pin').scrollIntoView({behavior:'auto',block:'nearest'});
  }
  function hideQuickPin(discard=false){
    if(quickSending)return;
    $('quick-pin').hidden=true;$('map-stage').classList.remove('quick-pin-open');quickPayload=null;
    if(discard){field('latitude').value='';field('longitude').value='';renderDraftMarker();}
  }
  function startQuickPin(){
    if(sending||quickSending)return;
    if(choosingPosition){cancelChoosing();return;}
    hideQuickPin();prepareEditor();choosingFromEditor=false;if(!map)loadMap();
    if(!map)return;setChoosing(true);notice($('map-status'),'Tap the map to drop a pin. No typing needed.');
    $('map-stage').scrollIntoView({behavior:'auto',block:'center'});$('map-canvas').focus({preventScroll:true});
  }
  async function sendQuickPin(event){
    event.preventDefault();if(quickSending||$('quick-pin').hidden)return;
    if(!quickPayload){
      const latitude=Number(field('latitude').value),longitude=Number(field('longitude').value);
      if(!field('latitude').value||!field('longitude').value||!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
      quickPayload={entryMode:'quick_pin',submissionId,name:$('quick-pin-name').value.trim(),latitude,longitude,publicationConsent:true,consentVersion:'2026-11-19'};
    }
    quickSending=true;for(const control of $('quick-pin-form').elements)control.disabled=true;$('close-quick-pin').disabled=true;
    $('send-quick-pin').textContent='Sending…';$('quick-pin-status').hidden=false;notice($('quick-pin-status'),'Sending your pin…');
    try{
      const result=await apiRequest('/api/map/suggestions',{method:'POST',body:JSON.stringify(quickPayload)});
      if(result.status!=='received'||!result.reference)throw new Error('The pin could not be confirmed.');
      quickSending=false;hideQuickPin();notice($('map-status'),'Pin saved for review.','success');$('map-status').dataset.reference=result.reference;$('add-map-pin').focus({preventScroll:true});
    }catch(error){
      notice($('quick-pin-status'),error.name==='AbortError'?'No confirmation yet. Try sending the same pin again.':error.message||'No confirmation yet. Try again.','error');
      $('send-quick-pin').disabled=false;$('send-quick-pin').textContent='Try sending again';$('close-quick-pin').disabled=false;
    }finally{quickSending=false;}
  }
  function updateCategoryFields(){const bus=field('category').value==='bus_stop';$('bus-stop-fields').hidden=!bus;if(!bus)field('stopMarking').value='unknown';updateSelectedIcon();}
  function setFormEnabled(enabled){for(const control of form.querySelectorAll('input,select,textarea,button'))control.disabled=!enabled;}
  function populate(data){
    for(const name of ['name','category','latitude','longitude','locationDescription','description','access','wheelchair','stopMarking','sourceType','sourceUrl','observedOn','publicCredit','iconId'])if(field(name)&&data[name]!==undefined&&data[name]!==null)field(name).value=String(data[name]);
    for(const box of form.querySelectorAll('[name=facilities]'))box.checked=Array.isArray(data.facilities)&&data.facilities.includes(box.value);
    field('publicationConsent').checked=false;updateCategoryFields();
  }
  function prepareEditor(options={}){
    if(!options.preserve){
      form.reset();field('iconId').value='';setFormEnabled(true);submissionId=crypto.randomUUID();correction=null;sent=false;$('suggestion-status').hidden=true;$('draft-status').textContent='';$('position-status').textContent='Choose a location above, or enter one below.';$('correction-context').hidden=true;$('place-dialog-title').textContent='Add a place.';$('submit-place').textContent='Send for review';$('manual-position').open=false;$('place-more-details').open=false;$('icon-chooser').hidden=true;$('choose-icon').setAttribute('aria-expanded','false');
      if(options.feature){const p=options.feature.properties,c=coords(options.feature);correction={placeId:featureId(options.feature),baseVersion:p.version};populate(p);setPosition(c[1],c[0],'Current recorded location. Move it if it needs correcting.');$('place-dialog-title').textContent='Suggest a correction.';$('correction-context').textContent='Updating: '+p.name;$('correction-context').hidden=false;}
      updateCategoryFields();renderDraftMarker();
    }
    $('draft-banner').hidden=!draftExists();
  }
  function openEditor(options={}){
    if(sending||quickSending)return;
    hideQuickPin();
    lastDialogOpener=document.activeElement;returnDialogFocus=true;prepareEditor(options);
    if(!$('place-dialog').open){if(typeof $('place-dialog').showModal==='function')$('place-dialog').showModal();else $('place-dialog').setAttribute('open','');}
    field('name').focus({preventScroll:true});
  }
  function closeEditor(restore=true){if(sending)return;returnDialogFocus=restore;if(typeof $('place-dialog').close==='function')$('place-dialog').close();else{$('place-dialog').removeAttribute('open');if(restore&&lastDialogOpener?.isConnected)lastDialogOpener.focus({preventScroll:true});}}
  function formData(requirePosition=false){
    const lat=field('latitude').value.trim(),lon=field('longitude').value.trim();
    if(requirePosition&&(!lat||!lon||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Number(lat)<-90||Number(lat)>90||Number(lon)<-180||Number(lon)>180))throw new Error('Choose a location on the map, use your location, or enter valid coordinates.');
    const value={submissionId,name:field('name').value.trim(),category:field('category').value,latitude:lat?Number(lat):null,longitude:lon?Number(lon):null,locationDescription:field('locationDescription').value.trim(),description:field('description').value.trim(),access:field('access').value,wheelchair:field('wheelchair').value,facilities:[...form.querySelectorAll('[name=facilities]:checked')].map(i=>i.value),stopMarking:field('category').value==='bus_stop'?field('stopMarking').value:'unknown',sourceType:field('sourceType').value,sourceUrl:field('sourceUrl').value.trim(),observedOn:field('observedOn').value,publicCredit:field('publicCredit').value.trim(),publicationConsent:field('publicationConsent').checked,consentVersion:'2026-11-19'};
    if(field('iconId').value)value.iconId=field('iconId').value;
    if(correction)Object.assign(value,correction);return value;
  }
  function showSuggestion(message,kind){notice($('suggestion-status'),message,kind);$('suggestion-status').hidden=false;$('suggestion-status').focus();}
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/geo+json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('add-place').hidden=false;$('add-detailed-place').hidden=false;$('load-map').hidden=false;$('export-places').hidden=false;renderCategories();renderIconPicker();updateSelectedIcon();
  $('add-place').addEventListener('click',startQuickPin);$('add-detailed-place').addEventListener('click',()=>openEditor());$('load-map').addEventListener('click',loadMap);$('remove-map').addEventListener('click',unloadMap);$('retry-places').addEventListener('click',()=>loadPlaces());$('more-places').addEventListener('click',()=>loadPlaces(true));
  $('map-road').addEventListener('click',()=>{if(baseView!=='road')setBaseView('road');});$('map-satellite').addEventListener('click',()=>{if(baseView!=='satellite')setBaseView('satellite');});
  $('find-me').addEventListener('click',findLocation);$('clear-location').addEventListener('click',clearLocation);
  $('add-map-pin').addEventListener('click',startQuickPin);
  $('quick-pin-form').addEventListener('submit',sendQuickPin);
  $('close-quick-pin').addEventListener('click',()=>{hideQuickPin(true);if(map)$('map-canvas').focus({preventScroll:true});});
  $('quick-pin-details').addEventListener('click',()=>{if(quickPayload||quickSending)return;field('name').value=$('quick-pin-name').value.trim();field('sourceType').value='map_pin';openEditor({preserve:true});});
  $('choose-icon').addEventListener('click',()=>{const open=$('icon-chooser').hidden;$('icon-chooser').hidden=!open;$('choose-icon').setAttribute('aria-expanded',String(open));if(open){renderIconPicker();$('icon-group').focus({preventScroll:true});}});
  $('default-icon').addEventListener('click',()=>chooseIcon(''));$('icon-group').addEventListener('change',renderIconPicker);$('icon-search').addEventListener('input',renderIconPicker);
  $('expand-map').addEventListener('click',()=>setExpanded(!expanded));$('toggle-map-list').addEventListener('click',()=>setExpandedList(!showExpandedList));$('directions-mode').addEventListener('change',updateDirections);
  window.addEventListener('resize',resizeMap);
  document.addEventListener('keydown',event=>{
    if($('place-dialog').open)return;
    if(event.key==='Escape'&&!$('quick-pin').hidden){event.preventDefault();event.stopPropagation();if(!quickSending){hideQuickPin(true);$('map-canvas').focus({preventScroll:true});}return;}
    if(!expanded)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setExpanded(false);return;}
    if(event.key!=='Tab')return;
    const focusable=[...mapLayout.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(node=>!node.disabled&&!node.closest('[hidden]')&&node.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);if(!first){event.preventDefault();mapLayout.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||!mapLayout.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!mapLayout.contains(document.activeElement))){event.preventDefault();first.focus();}
  },true);
  $('map-canvas').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target===$('map-canvas')&&map&&!quickSending){event.preventDefault();map.fire('click',{latlng:map.getCenter()});}});
  $('map-area').addEventListener('change',()=>{closeDetail();zoomToArea();loadPlaces();});
  $('place-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{closeDetail();loadPlaces();},300);});
  $('close-detail').addEventListener('click',closeDetail);$('correct-place').addEventListener('click',()=>{if(selectedFeature)openEditor({feature:selectedFeature});});
  $('close-place-dialog').addEventListener('click',()=>closeEditor());$('place-dialog').addEventListener('close',()=>{if(returnDialogFocus&&lastDialogOpener?.isConnected)lastDialogOpener.focus({preventScroll:true});});
  $('place-dialog').addEventListener('cancel',event=>{if(sending){event.preventDefault();return;}returnDialogFocus=true;});
  field('category').addEventListener('change',updateCategoryFields);
  $('choose-on-map').addEventListener('click',()=>{choosingFromEditor=true;setChoosing(true);closeEditor(false);if(!map)loadMap();if(!expanded)$('map-stage').scrollIntoView({behavior:'auto',block:'center'});notice($('map-status'),map?'Tap the map to choose the place.':'The map is unavailable. Cancel and enter the location another way.');(map?$('map-canvas'):$('load-map')).focus({preventScroll:true});});
  $('cancel-position').addEventListener('click',cancelChoosing);
  $('use-position').addEventListener('click',()=>{
    if(!navigator.geolocation){notice($('position-status'),'Location is unavailable on this device. Choose a map pin or enter coordinates instead.','error');return;}
    $('use-position').disabled=true;notice($('position-status'),'Requesting your location…');
    navigator.geolocation.getCurrentPosition(position=>{$('use-position').disabled=false;setPosition(position.coords.latitude,position.coords.longitude,'Device location selected. Estimated accuracy: '+Math.round(position.coords.accuracy)+' metres. Check the facility position.');if(map)map.setView([position.coords.latitude,position.coords.longitude],17,{animate:false});},()=>{$('use-position').disabled=false;notice($('position-status'),'Your location could not be obtained. Choose a map pin or enter coordinates instead.','error');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  for(const name of ['latitude','longitude'])field(name).addEventListener('change',()=>{renderDraftMarker();notice($('position-status'),'Location entered. Check that it marks the facility itself.');});
  $('save-draft').addEventListener('click',()=>{try{const data=formData();data.publicationConsent=false;localStorage.setItem(draftKey,JSON.stringify({schema:'ready-setco-place-draft/1',savedAt:new Date().toISOString(),suggestion:data}));$('draft-banner').hidden=false;notice($('draft-status'),'Draft saved on this device. It has not been sent to the register.');}catch{notice($('draft-status'),'This browser could not save a draft. Download a copy instead.','error');}});
  $('restore-draft').addEventListener('click',()=>{
    if(sending)return;
    try{
      const stored=JSON.parse(localStorage.getItem(draftKey));if(stored?.schema!=='ready-setco-place-draft/1'||!stored.suggestion)throw new Error('Unsupported draft');
      form.reset();field('iconId').value='';setFormEnabled(true);populate(stored.suggestion);submissionId=typeof stored.suggestion.submissionId==='string'?stored.suggestion.submissionId:crypto.randomUUID();correction=stored.suggestion.placeId&&stored.suggestion.baseVersion?{placeId:stored.suggestion.placeId,baseVersion:stored.suggestion.baseVersion}:null;sent=false;
      $('suggestion-status').hidden=true;$('submit-place').textContent='Send for review';$('place-dialog-title').textContent=correction?'Suggest a correction.':'Add a place.';$('correction-context').textContent=correction?'Restored a correction draft. Check the details before sending.':'';$('correction-context').hidden=!correction;renderDraftMarker();notice($('position-status'),'Saved draft restored. Check the location before sending.');notice($('draft-status'),'Draft restored. Please check the public sharing choice before sending.');
    }catch{notice($('draft-status'),'This saved draft could not be read. You can remove it and start again.','error');}
  });
  $('remove-draft').addEventListener('click',()=>{try{localStorage.removeItem(draftKey);$('draft-banner').hidden=true;notice($('draft-status'),'Saved device draft removed. The form has not been cleared.');}catch{notice($('draft-status'),'This browser could not remove the saved draft.','error');}});
  $('download-draft').addEventListener('click',()=>{const data=formData(),positioned=Number.isFinite(data.latitude)&&Number.isFinite(data.longitude);download({type:'FeatureCollection',metadata:{status:'unsubmitted-device-draft',exportedAt:new Date().toISOString()},features:[{type:'Feature',geometry:positioned?{type:'Point',coordinates:[data.longitude,data.latitude]}:null,properties:data}]},'ready-setco-place-draft.geojson');notice($('draft-status'),'Draft copy downloaded. It has not been sent to the register.');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||sent)return;let data;
    try{data=formData(true);}catch(error){showSuggestion(error.message,'error');$('manual-position').open=true;field('latitude').focus();return;}
    if(!form.reportValidity())return;sending=true;setFormEnabled(false);$('close-place-dialog').disabled=true;$('submit-place').textContent='Sending…';showSuggestion('Sending your suggestion…','pending');
    try{
      const result=await apiRequest('/api/map/suggestions',{method:'POST',body:JSON.stringify(data)});if(result.status!=='received'||!result.reference)throw new Error('Your suggestion could not be confirmed. Please try again.');
      sent=true;showSuggestion('Thank you. Your suggestion is saved and awaiting review. Reference: '+result.reference+'. It will appear on the public map after review.','success');$('submit-place').textContent='Saved for review';setFormEnabled(false);
      try{const saved=JSON.parse(localStorage.getItem(draftKey));if(saved?.suggestion?.submissionId===submissionId)localStorage.removeItem(draftKey);}catch{}
      $('draft-banner').hidden=true;
    }catch(error){showSuggestion(error.name==='AbortError'?'The reply took too long. Your entry is still here; try sending it again.':error.message||'Delivery could not be confirmed. Try again or keep a device draft.','error');setFormEnabled(true);$('submit-place').textContent='Try sending again';}
    finally{sending=false;$('close-place-dialog').disabled=false;}
  });
  $('export-places').addEventListener('click',async()=>{
    $('export-places').disabled=true;notice($('export-status'),'Preparing the published place records…');
    try{const result=await apiRequest('/api/map/export');if(result.type!=='FeatureCollection'||!Array.isArray(result.features))throw new Error('The map data could not be read.');download(result,'ready-setco-published-places.geojson');notice($('export-status'),'Downloaded '+result.features.length+' published place records. Pending suggestions are kept out of the public download.');}
    catch(error){notice($('export-status'),error.message||'The map data could not be downloaded. Please try again.','error');}
    finally{$('export-places').disabled=false;}
  });
  loadPlaces();
})();
