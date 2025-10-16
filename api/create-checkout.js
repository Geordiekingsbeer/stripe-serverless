<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reserve Your Table</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:Arial,Helvetica,sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;padding:20px 10px;background:#e3e3e3;min-height:100vh;}
h1{font-size:32px;font-weight:700;color:#333;margin-bottom:5px;}
.subtitle{font-size:18px;color:#666;margin-bottom:30px;}
#datetime-controls{display:flex;gap:10px;margin-bottom:15px;align-items:center;max-width:480px;width:100%;}
#datetime-controls input{flex:1;padding:12px 10px;border:1px solid #ccc;border-radius:4px;background:white;font-size:16px;color:#333;font-weight:500;text-align:center;font-family:Arial,sans-serif;}
#check-availability{padding:12px 10px;background:#b7d7a8;color:#333;border:none;border-radius:4px;cursor:pointer;font-weight:600;white-space:nowrap;}
#multi-select-toggle{padding:10px 15px;font-size:16px;font-weight:500;margin-bottom:20px;border-radius:4px;cursor:pointer;border:1px solid #ccc;background:#f7f7f7;color:#333;width:90vw;max-width:480px;}
#multi-select-toggle.active{background:#1976d2;color:white;border-color:#1976d2;}
#container-wrapper{display:flex;justify-content:center;width:100%;max-width:480px;}
#container{width:100%;height:auto;border:none;background:transparent;}
.status-legend{margin-top:10px;font-size:14px;color:#555;display:flex;gap:15px;flex-wrap:wrap;justify-content:center;max-width:480px;width:100%;}
.legend-item{display:flex;align-items:center;}
.legend-color{width:15px;height:15px;border-radius:3px;margin-right:5px;border:1px solid #000;}
#payBtn{margin-top:20px;padding:12px 24px;font-size:16px;background:#388e3c;color:#fff;border:none;border-radius:20px;cursor:pointer;width:90vw;max-width:480px;}
#payBtn:disabled{background:#bbb;cursor:not-allowed;}
.modal{display:none;position:fixed;z-index:1001;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.4);justify-content:center;align-items:center;}
.modal-content{background:#fff;padding:30px;border:1px solid #888;width:90%;max-width:400px;border-radius:10px;margin:10vh auto;}
.modal-content input{width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;}
#confirm-booking-btn{background:#388e3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer;width:100%;}
</style>
</head>
<body>
<h1>Reserve Your Table</h1>
<p class="subtitle">Select your preferred seating</p>

<div id="datetime-controls">
	<input type="date" id="booking-date">
	<input type="time" id="booking-time">
	<button id="check-availability">Check Availability</button>
</div>

<button id="multi-select-toggle" data-active="false">Start Group Selection (Tap Mode)</button>

<div id="container-wrapper"><div id="container"></div></div>

<div class="status-legend">
	<div class="legend-item"><span class="legend-color" style="background:#b7d7a8;"></span>Premium Available</div>
	<div class="legend-item"><span class="legend-color" style="background:#e0e0e0;"></span>Booked (Premium)</div>
	<div class="legend-item"><span class="legend-color" style="background:#fff;"></span>Staff Use Only (N/A)</div>
</div>

<button id="payBtn" disabled>Pay for 0 Tables – Stripe</button>

<div id="customer-modal" class="modal">
	<div class="modal-content">
		<h3>Confirm Reservation Details</h3>
		<form id="customer-form">
			<input type="text" id="customer-name" placeholder="Full Name" required>
			<input type="number" id="party-size" placeholder="Party Size (e.g., 4)" min="1" required>
			<input type="email" id="customer-email" placeholder="Email for Receipt" required>
			<button type="submit" id="confirm-booking-btn">Proceed to Payment</button>
		</form>
	</div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://unpkg.com/konva@9/konva.min.js"></script>
<script>
/* ----------  CONFIG  ---------- */
const STAGE_WIDTH  = 480;
const STAGE_HEIGHT = 480;
const supabaseUrl  = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const supabaseAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyanZkYWJ0cXprYW9tanVpcmVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDM3MzQsImV4cCI6MjA3NDcxOTczNH0.wAEeowZ8Yc8K54jAxEbY-8-mM0OGciMmyz6fJb9Z1Qg';
const _supa = supabase.createClient(supabaseUrl, supabaseAnon);

const PRICE_2 = 499, PRICE_4 = 999, PRICE_6 = 1499; // pence
const TABLE_COLOR = '#b7d7a8', BOOKED = '#e0e0e0', STAFF = '#ffffff', HIGHLIGHT = '#ffeb3b';
const STAFF_IDS = [10,13,12,14,1];

let selectedIds = [], bookings = [], isMulti = false, urlParams = {};

/* ----------  SMALL UTILS  ---------- */
function timeToMin(t){ const [h,m] = t.split(':').map(Number); return h*60 + m; }
function getPrice(w,h){
	if(w===30 && h===30) return PRICE_2;
	if((w===30 && h===50)||(w===50 && h===30)) return PRICE_4;
	if(w===90 && h===30) return PRICE_6;
	return 0;
}
function totalPence(){ return selectedIds.reduce((t,id)=>t+(tableMap.get(id)?.price||0),0); }
function updateBtn(){
	const p = totalPence();
	payBtn.disabled = !p;
	payBtn.textContent = p ? `Pay £${(p/100).toFixed(2)} – Stripe` : 'Pay for 0 Tables – Stripe';
}

/* ----------  URL PARAMS  ---------- */
function getUrlParams(){
	const u = new URLSearchParams(location.search);
	urlParams.tenant_id = u.get('tenant_id') || 'R-DEMO';
	urlParams.booking_ref = u.get('booking_ref');
	urlParams.source      = u.get('source');
}
getUrlParams();

/* ----------  KONVA SETUP  ---------- */
const stage = new Konva.Stage({container:'container',width:STAGE_WIDTH,height:STAGE_HEIGHT});
const bgLayer = new Konva.Layer(), tblLayer = new Konva.Layer();
stage.add(bgLayer); stage.add(tblLayer);

const container = document.getElementById('container');
function resize(){
	const w = container.offsetWidth, scale = w/STAGE_WIDTH;
	stage.width(w); stage.height(STAGE_HEIGHT*scale); stage.scale({x:scale,y:scale});
	container.style.height = STAGE_HEIGHT*scale+'px'; stage.draw();
}
window.addEventListener('resize', resize);

/* ----------  LOAD FLOORPLAN  ---------- */
function loadFloorplan(cb){
	const img = new Image();
	img.onload = ()=>{
		bgLayer.add(new Konva.Image({x:0,y:0,image:img,width:STAGE_WIDTH,height:STAGE_HEIGHT}));
		bgLayer.draw(); resize(); if(cb) cb();
	};
	img.src = 'floorplan.png?v='+Date.now();
}

/* ----------  DRAW TABLES  ---------- */
const tableMap = new Map();
function drawTable(t){
	const g = new Konva.Group({id:'g-'+t.id, name:'table'});
	tblLayer.add(g);
	const r = new Konva.Rect({width:t.w,height:t.h,fill:TABLE_COLOR,stroke:'#000',strokeWidth:1,name:'main-table'});
	g.add(r);
	g.on('click tap',()=>selectTable(t.id));
	tableMap.set(t.id,{id:t.id,price:getPrice(t.w,t.h),rect:r});
	return g;
}

/* ----------  TABLE SELECTION  ---------- */
function selectTable(id){
	const data = tableMap.get(id);
	if(!data || data.rect.fill()===STAFF || data.rect.fill()===BOOKED){ alert('This table is not available for online booking.'); return; }
	const idx = selectedIds.indexOf(id);
	if(idx===-1){ if(!isMulti){ selectedIds.forEach(i=> tableMap.get(i).rect.stroke('#000')); selectedIds=[]; } selectedIds.push(id); data.rect.stroke(HIGHLIGHT); data.rect.strokeWidth(3); }
	else { if(isMulti||selectedIds.length===1){ selectedIds.splice(idx,1); data.rect.stroke('#000'); data.rect.strokeWidth(1); } }
	updateBtn(); tblLayer.draw();
}

/* ----------  LOAD BOOKINGS  ---------- */
async function loadBookings(){
	const date = document.getElementById('booking-date').value;
	const time = document.getElementById('booking-time').value;
	if(!date||!time){ bookings=[]; updateVisual(); return; }
	const {data,error} = await _supa.from('premium_slots').select('*').eq('date',date);
	if(error){ console.error(error); bookings=[]; }
	else {
		const m = timeToMin(time);
		bookings = data.filter(b=> m>=timeToMin(b.start_time) && m<timeToMin(b.end_time));
	}
	updateVisual();
}
function updateVisual(){
	tableMap.forEach((t)=>{
		t.rect.stroke('#000').strokeWidth(1);
		if(STAFF_IDS.includes(t.id)) t.rect.fill(STAFF);
		else t.rect.fill(bookings.some(b=>Number(b.table_id)===t.id)?BOOKED:TABLE_COLOR);
	});
	selectedIds.forEach(id=>{
		const t=tableMap.get(id);
		if(t.rect.fill()===TABLE_COLOR){ t.rect.stroke(HIGHLIGHT).strokeWidth(3); }
		else { selectedIds=selectedIds.filter(i=>i!==id); }
	});
	updateBtn(); tblLayer.draw();
}

/* ----------  STRIPE CHECKOUT  ---------- */
payBtn.onclick=()=>{ if(!selectedIds.length) return; customerModal.style.display='flex'; };
document.getElementById('customer-form').onsubmit=async(e)=>{
	e.preventDefault();
	const name  = document.getElementById('customer-name').value.trim();
	const email = document.getElementById('customer-email').value.trim();
	const party = parseInt(document.getElementById('party-size').value);
	if(!name||!email||!party){ alert('Please complete all fields.'); return; }
	customerModal.style.display='none';
	const date = document.getElementById('booking-date').value;
	const time = document.getElementById('booking-time').value;
	const total = totalPence();
	try{
		const res = await fetch('https://dine-checkout-live.vercel.app/api/create-checkout',{
			method:'POST',
			headers:{'Content-Type':'application/json'},
			body:JSON.stringify({
				table_ids:selectedIds,
				booking_date:date,
				booking_time:time,
				customer_email:email,
				customer_name:name,
				party_size:party,
				total_pence:total,
				tenant_id:urlParams.tenant_id,
				booking_ref:urlParams.booking_ref
			})
		});
		const data=await res.json();
		if(data.url){ window.location.href=data.url; } else { alert('Checkout failed.'); }
	}catch(err){ console.error(err); alert('Network error.'); }
};

/* ----------  BASE TABLES (fallback if DB empty)  ---------- */
const baseTables = [
{id:1,x:235,y:110,w:90,h:30,r:0},{id:2,x:100,y:30,w:90,h:30,r:0},{id:3,x:100,y:150,w:30,h:30,r:0},{id:4,x:140,y:220,w:30,h:30,r:0},{id:5,x:180,y:300,w:50,h:30,r:90},{id:6,x:250,y:330,w:30,h:30,r:0},{id:7,x:30,y:300,w:50,h:30,r:90},{id:8,x:400,y:100,w:30,h:30,r:0},{id:9,x:20,y:180,w:30,h:50,r:0},{id:10,x:300,y:240,w:30,h:30,r:0},{id:11,x:40,y:80,w:30,h:30,r:0},{id:12,x:350,y:350,w:50,h:30,r:0},{id:13,x:400,y:280,w:30,h:30,r:0},{id:14,x:250,y:180,w:30,h:30,r:0},{id:18,x:140,y:280,w:30,h:30,r:0},{id:19,x:220,y:280,w:30,h:30,r:0},{id:20,x:300,y:280,w:30,h:30,r:0},{id:21,x:300,y:180,w:50,h:30,r:90}
];

/* ----------  INIT  ---------- */
document.getElementById('check-availability').onclick=loadBookings;
(async ()=>{
	const today=new Date(), y=today.getFullYear(), m=String(today.getMonth()+1).padStart(2,'0'), d=String(today.getDate()).padStart(2,'0');
	document.getElementById('booking-date').value=`${y}-${m}-${d}`;
	document.getElementById('booking-time').value='19:00';

	// 1. draw floor-plan
	loadFloorplan(()=>{
		// 2. draw tables (fallback to base if DB empty)
		baseTables.forEach(t=>drawTable(t));
		// 3. colour bookings
		loadBookings();
	});
})();
</script>
</body>
</html>
