const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('./db');
const app = express();
app.use(cors()); app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname, '../public')));
const pool = getPool();
const secret = () => process.env.JWT_SECRET || 'development-only-change-this-secret';
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const auth = (req,res,next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  try { req.user = jwt.verify(token, secret()); next(); }
  catch { res.status(401).json({error:'Please sign in to continue.'}); }
};
const roles = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : res.status(403).json({error:'You do not have permission for this action.'});
const clean = v => String(v ?? '').trim();
const fail = (res, status, message) => res.status(status).json({error:message});
app.get('/api/health', asyncRoute(async(req,res)=>{ await pool.query('SELECT 1'); res.json({ok:true,service:'food-donation-api'}); }));
app.get('/api/meta', asyncRoute(async(req,res)=>{
 const [cats]=await pool.query('SELECT Category_ID, Category_Name, Is_Perishable FROM Food_Category ORDER BY Category_Name');
 res.json({categories:cats, statuses:['Available','Collected','Distributed','Expired']});
}));
app.post('/api/auth/register', asyncRoute(async(req,res)=>{
 const {name,email,password,role='Donor',phone,city,ngoId,donorType='Individual'}=req.body;
 if(!name||!email||!password||password.length<8) return fail(res,400,'Name, email and a password of at least 8 characters are required.');
 if(!['Donor','NGO','Volunteer'].includes(role)) return fail(res,400,'Choose Donor, NGO or Volunteer registration.');
 const conn=await pool.getConnection();
 try {
  await conn.beginTransaction();
  const hash=await bcrypt.hash(password,12);
  let profileId=null;
  if(role==='Donor') { if(!['Individual','Restaurant','Event Organiser'].includes(donorType)) throw new Error('INVALID_DONOR_TYPE'); const [r]=await conn.execute('INSERT INTO Donor (Name,Donor_Type,Phone,Email,Address,City) VALUES (?,?,?,?,?,?)',[name,donorType,phone||null,email,null,city||'']); profileId=r.insertId; }
  else if(role==='NGO') { const [r]=await conn.execute('INSERT INTO NGO (Name,Reg_No,Phone,Email,City) VALUES (?,?,?,?,?)',[name,`PENDING-${Date.now()}-${Math.floor(Math.random()*1000)}`,phone||'Pending',email,city||'']); profileId=r.insertId; }
  else { if(!ngoId) throw new Error('NGO_ID_REQUIRED'); const [r]=await conn.execute('INSERT INTO Volunteer (NGO_ID,Name,Phone,Vehicle_Type) VALUES (?,?,?,?)',[ngoId,name,phone||`PENDING-${Date.now()}`,'None']); profileId=r.insertId; }
  const [u]=await conn.execute('INSERT INTO App_User (Name,Email,Password_Hash,Role,Profile_ID) VALUES (?,?,?,?,?)',[name,email,hash,role,profileId]);
  await conn.commit(); const token=jwt.sign({id:u.insertId,name,email,role,profileId},secret(),{expiresIn:'7d'});
  res.status(201).json({token,user:{id:u.insertId,name,email,role,profileId}});
 } catch(e) { await conn.rollback(); if(e.code==='ER_DUP_ENTRY') return fail(res,409,'This email or phone is already registered.'); if(e.message==='NGO_ID_REQUIRED') return fail(res,400,'Select the NGO you volunteer with.'); if(e.message==='INVALID_DONOR_TYPE') return fail(res,400,'Select a valid donor type.'); throw e; } finally {conn.release();}
}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
 const {email,password}=req.body; const [[u]]=await pool.execute('SELECT * FROM App_User WHERE Email=? AND Is_Active=1',[email||'']);
 if(!u || !(await bcrypt.compare(password||'',u.Password_Hash))) return fail(res,401,'Incorrect email or password.');
 const token=jwt.sign({id:u.User_ID,name:u.Name,email:u.Email,role:u.Role,profileId:u.Profile_ID},secret(),{expiresIn:'7d'});
 res.json({token,user:{id:u.User_ID,name:u.Name,email:u.Email,role:u.Role,profileId:u.Profile_ID}});
}));
app.get('/api/dashboard', asyncRoute(async(req,res)=>{
 const [[totals]]=await pool.query(`SELECT COUNT(*) totalDonations, COALESCE(SUM(Quantity),0) totalQuantity, SUM(Status='Available') available, SUM(Status='Collected') collected, SUM(Status='Distributed') distributed, SUM(Status='Expired') expired FROM Food_Donation`);
 const [[counts]]=await pool.query(`SELECT (SELECT COUNT(*) FROM Donor) donors,(SELECT COUNT(*) FROM NGO) ngos,(SELECT COUNT(*) FROM Volunteer) volunteers,(SELECT COUNT(*) FROM Recipient WHERE Is_Verified=1) verifiedRecipients`);
 const [recent]=await pool.query(`SELECT d.Donation_ID,d.Food_Item,d.Quantity,d.Unit,d.Expiry_Date,d.Status,fc.Category_Name,don.Name donorName,don.City FROM Food_Donation d JOIN Food_Category fc ON fc.Category_ID=d.Category_ID JOIN Donor don ON don.Donor_ID=d.Donor_ID ORDER BY d.Donation_ID DESC LIMIT 6`);
 const [byStatus]=await pool.query(`SELECT Status,COUNT(*) count FROM Food_Donation GROUP BY Status`);
 res.json({totals:{...totals,...counts},recent,byStatus});
}));
app.get('/api/donations', asyncRoute(async(req,res)=>{
 const {status,category,search}=req.query; let sql=`SELECT d.Donation_ID,d.Food_Item,d.Quantity,d.Unit,d.Donation_Date,d.Expiry_Date,d.Status,fc.Category_Name,don.Name donorName,don.City FROM Food_Donation d JOIN Food_Category fc ON fc.Category_ID=d.Category_ID JOIN Donor don ON don.Donor_ID=d.Donor_ID WHERE 1=1`; const args=[];
 if(status){sql+=' AND d.Status=?';args.push(status);} if(category){sql+=' AND d.Category_ID=?';args.push(category);} if(search){sql+=' AND (d.Food_Item LIKE ? OR don.City LIKE ? OR don.Name LIKE ?)';args.push(`%${search}%`,`%${search}%`,`%${search}%`);} sql+=' ORDER BY (d.Status="Available") DESC,d.Expiry_Date ASC,d.Donation_ID DESC LIMIT 100';
 const [rows]=await pool.execute(sql,args); res.json(rows);
}));
app.post('/api/donations',auth,roles('Donor','Admin'),asyncRoute(async(req,res)=>{
 const {categoryId,foodItem,quantity,unit,donationDate,expiryDate}=req.body; const donorId=req.user.profileId;
 if(!donorId||!categoryId||!foodItem||!Number(quantity)||Number(quantity)<=0||!unit||!donationDate||!expiryDate) return fail(res,400,'Complete all donation details with a quantity greater than zero.');
 const [r]=await pool.execute(`INSERT INTO Food_Donation (Donor_ID,Category_ID,Food_Item,Quantity,Unit,Donation_Date,Expiry_Date) VALUES (?,?,?,?,?,?,?)`,[donorId,categoryId,foodItem,quantity,unit,donationDate,expiryDate]);
 res.status(201).json({message:'Your donation is now listed.',donationId:r.insertId});
}));
app.get('/api/ngos', asyncRoute(async(req,res)=>{const [rows]=await pool.query('SELECT NGO_ID,Name,City FROM NGO ORDER BY Name');res.json(rows);}));
app.get('/api/recipients',auth,asyncRoute(async(req,res)=>{const [rows]=await pool.query(`SELECT r.Recipient_ID,r.Name,r.Family_Size,r.Phone,r.Address,r.Is_Verified,n.Name NGO_Name FROM Recipient r JOIN NGO n ON n.NGO_ID=r.NGO_ID ORDER BY r.Is_Verified,r.Name`);res.json(rows);}));
app.post('/api/recipients',auth,roles('NGO','Admin'),asyncRoute(async(req,res)=>{const {name,ngoId,familySize,phone,address}=req.body;if(!name||!ngoId||Number(familySize)<1)return fail(res,400,'Name, NGO and a valid family size are required.');const [r]=await pool.execute('INSERT INTO Recipient (NGO_ID,Name,Family_Size,Phone,Address,Is_Verified) VALUES (?,?,?,?,?,0)',[ngoId,name,familySize,phone||null,address||null]);res.status(201).json({recipientId:r.insertId,message:'Recipient added. Verification is pending.'});}));
app.patch('/api/recipients/:id/verify',auth,roles('NGO','Admin'),asyncRoute(async(req,res)=>{const [r]=await pool.execute('UPDATE Recipient SET Is_Verified=1 WHERE Recipient_ID=?',[req.params.id]);if(!r.affectedRows)return fail(res,404,'Recipient not found.');res.json({message:'Recipient verified.'});}));
app.get('/api/volunteers',auth,asyncRoute(async(req,res)=>{const [rows]=await pool.query('SELECT v.Volunteer_ID,v.Name,v.Phone,v.Vehicle_Type,n.Name NGO_Name FROM Volunteer v JOIN NGO n ON n.NGO_ID=v.NGO_ID ORDER BY v.Name');res.json(rows);}));
app.get('/api/pickups',auth,roles('Volunteer','NGO','Admin'),asyncRoute(async(req,res)=>{const [rows]=await pool.query(`SELECT pd.Pickup_ID,pd.Pickup_Time,pd.Delivery_Time,fd.Food_Item,fd.Quantity,fd.Unit,fd.Expiry_Date,v.Name Volunteer_Name FROM Pickup_Delivery pd JOIN Food_Donation fd ON fd.Donation_ID=pd.Donation_ID JOIN Volunteer v ON v.Volunteer_ID=pd.Volunteer_ID ORDER BY pd.Pickup_ID DESC`);res.json(rows);}));
app.post('/api/pickups',auth,roles('Volunteer','NGO','Admin'),asyncRoute(async(req,res)=>{
 const {donationId,volunteerId,pickupTime}=req.body; if(!donationId||!volunteerId||!pickupTime)return fail(res,400,'Donation, volunteer and pickup time are required.');
 const conn=await pool.getConnection();try{await conn.beginTransaction();const [[d]]=await conn.execute('SELECT Status,Expiry_Date FROM Food_Donation WHERE Donation_ID=? FOR UPDATE',[donationId]);if(!d){await conn.rollback();return fail(res,404,'Donation not found.');}const [[v]]=await conn.execute('SELECT Volunteer_ID FROM Volunteer WHERE Volunteer_ID=?',[volunteerId]);if(!v){await conn.rollback();return fail(res,400,'Volunteer not found.');}const [r]=await conn.execute('INSERT INTO Pickup_Delivery (Donation_ID,Volunteer_ID,Pickup_Time) VALUES (?,?,?)',[donationId,volunteerId,pickupTime]);await conn.commit();res.status(201).json({pickupId:r.insertId,message:'Pickup recorded. Donation status updated to Collected.'});}catch(e){await conn.rollback();if(e.sqlState==='45000'||e.code==='ER_DUP_ENTRY')return fail(res,409,e.sqlMessage||'This donation cannot be picked up.');throw e;}finally{conn.release();}
}));
app.patch('/api/pickups/:id/delivered',auth,roles('Volunteer','NGO','Admin'),asyncRoute(async(req,res)=>{const {deliveryTime}=req.body;if(!deliveryTime)return fail(res,400,'Delivery time is required.');const [r]=await pool.execute('UPDATE Pickup_Delivery SET Delivery_Time=? WHERE Pickup_ID=? AND (Delivery_Time IS NULL OR Delivery_Time<=?)',[deliveryTime,req.params.id,deliveryTime]);if(!r.affectedRows)return fail(res,400,'Pickup not found or delivery time is earlier than pickup time.');res.json({message:'Delivery time saved.'});}));
app.post('/api/distributions',auth,roles('Volunteer','NGO','Admin'),asyncRoute(async(req,res)=>{
 const {pickupId,recipientId,quantity,date}=req.body;if(!pickupId||!recipientId||!Number(quantity)||Number(quantity)<=0||!date)return fail(res,400,'Complete all distribution details with a quantity greater than zero.');
 const conn=await pool.getConnection();try{await conn.beginTransaction();const [[p]]=await conn.execute(`SELECT pd.Pickup_ID,fd.Donation_ID,fd.Quantity,fd.Expiry_Date,fd.Status FROM Pickup_Delivery pd JOIN Food_Donation fd ON fd.Donation_ID=pd.Donation_ID WHERE pd.Pickup_ID=? FOR UPDATE`,[pickupId]);if(!p){await conn.rollback();return fail(res,404,'Pickup not found.');}const [[r]]=await conn.execute('SELECT Is_Verified FROM Recipient WHERE Recipient_ID=?',[recipientId]);if(!r){await conn.rollback();return fail(res,404,'Recipient not found.');}const [ins]=await conn.execute('INSERT INTO Distribution (Pickup_ID,Recipient_ID,Quantity_Distributed,Distribution_Date) VALUES (?,?,?,?)',[pickupId,recipientId,quantity,date]);await conn.commit();res.status(201).json({distributionId:ins.insertId,message:'Distribution recorded successfully.'});}catch(e){await conn.rollback();if(e.sqlState==='45000')return fail(res,409,e.sqlMessage||'Distribution rejected by a database rule.');throw e;}finally{conn.release();}
}));
app.get('/api/trace/:id',asyncRoute(async(req,res)=>{const [rows]=await pool.execute(`SELECT fd.Donation_ID,fd.Food_Item,fd.Quantity,fd.Unit,fd.Expiry_Date,fd.Status,don.Name donorName,don.City donorCity,pd.Pickup_ID,pd.Pickup_Time,pd.Delivery_Time,v.Name volunteerName,dist.Distribution_ID,dist.Quantity_Distributed,dist.Distribution_Date,r.Name recipientName,r.Family_Size FROM Food_Donation fd JOIN Donor don ON don.Donor_ID=fd.Donor_ID LEFT JOIN Pickup_Delivery pd ON pd.Donation_ID=fd.Donation_ID LEFT JOIN Volunteer v ON v.Volunteer_ID=pd.Volunteer_ID LEFT JOIN Distribution dist ON dist.Pickup_ID=pd.Pickup_ID LEFT JOIN Recipient r ON r.Recipient_ID=dist.Recipient_ID WHERE fd.Donation_ID=? ORDER BY dist.Distribution_ID`,[req.params.id]);if(!rows.length)return fail(res,404,'Donation not found.');res.json(rows);}));
app.get('/api/reports/category',auth,roles('NGO','Admin'),asyncRoute(async(req,res)=>{const [rows]=await pool.query(`SELECT fc.Category_Name,COUNT(fd.Donation_ID) donationCount,COALESCE(SUM(fd.Quantity),0) totalQuantity FROM Food_Category fc LEFT JOIN Food_Donation fd ON fd.Category_ID=fc.Category_ID GROUP BY fc.Category_ID,fc.Category_Name ORDER BY totalQuantity DESC`);res.json(rows);}));
app.post('/api/housekeeping/expire',auth,roles('Admin'),asyncRoute(async(req,res)=>{const [r]=await pool.query('CALL sp_mark_expired()');res.json({message:'Expiry housekeeping completed.',result:r[0]||[]});}));
app.use((err,req,res,next)=>{console.error(err);if(err.code==='ER_NO_SUCH_TABLE')return fail(res,503,'Database tables are not installed. Run database/schema.sql first.');if(err.code==='ER_DUP_ENTRY')return fail(res,409,'A record with this unique value already exists.');if(err.code==='ER_NO_REFERENCED_ROW_2')return fail(res,400,'The selected related record does not exist.');if(err.sqlState==='45000')return fail(res,409,err.sqlMessage||'A database business rule rejected this operation.');res.status(500).json({error:process.env.NODE_ENV==='production'?'Something went wrong. Please try again.':err.message});});
module.exports=app;
