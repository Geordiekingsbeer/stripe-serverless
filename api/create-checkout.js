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
/* ----------  FLOORPLAN + CLICKABLE TABLES + DB TEST  ---------- */
const stage = new Konva.Stage({container:'container',width:480,height:480});
const bgLayer   = new Konva.Layer();
const tblLayer  = new Konva.Layer();
stage.add(bgLayer); stage.add(tblLayer);

// 1. load floor-plan
const img = new Image();
img.onload = () => {
	bgLayer.add(new Konva.Image({x:0,y:0,image:img,width:480,height:480}));
	bgLayer.draw();
};
img.src = 'floorplan.png?v=' + Date.now();

// 2. draw tables + click
const base = [
{id:1,x:235,y:110,w:90,h:30},{id:2,x:100,y:30,w:90,h:30},{id:3,x:100,y:150,w:30,h:30},{id:4,x:140,y:220,w:30,h:30},{id:5,x:180,y:300,w:50,h:30},{id:6,x:250,y:330,w:30,h:30},{id:7,x:30,y:300,w:50,h:30},{id:8,x:400,y:100,w:30,h:30},{id:9,x:20,y:180,w:30,h:50},{id:10,x:300,y:240,w:30,h:30},{id:11,x:40,y:80,w:30,h:30},{id:12,x:350,y:350,w:50,h:30},{id:13,x:400,y:280,w:30,h:30},{id:14,x:250,y:180,w:30,h:30},{id:18,x:140,y:280,w:30,h:30},{id:19,x:220,y:280,w:30,h:30},{id:20,x:300,y:280,w:30,h:30},{id:21,x:300,y:180,w:50,h:30}
];

base.forEach(t=>{
	const r = new Konva.Rect({x:t.x,y:t.y,width:t.w,height:t.h,fill:'#b7d7a8',stroke:'#000',strokeWidth:1});
	r.on('click tap',()=>{ r.fill('#ffeb3b'); tblLayer.draw(); console.log('Table '+t.id+' clicked'); });
	tblLayer.add(r);
});
tblLayer.draw();

// 3. DB test after 1 second
setTimeout(async () => {
	const {data,error} = await supabase.createClient('https://Rrjvdabtqzkaomjuiref.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyanZkYWJ0cXprYW9tanVpcmVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDM3MzQsImV4cCI6MjA3NDcxOTczNH0.wAEeowZ8Yc8K54jAxEbY-8-mM0OGciMmyz6fJb9Z1Qg')
	.from('premium_slots').select('*').eq('date','2025-10-17');
	console.log('bookings',data,'error',error);
}, 1000);
</script>
</body>
</html>
