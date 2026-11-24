require('dotenv').config();
const bcrypt=require('bcryptjs');
const {getPool}=require('../api/db');
(async()=>{const [,,email,name,password]=process.argv;if(!email||!name||!password){console.log('Usage: node scripts/create-admin.js admin@email.com "Admin Name" "StrongPassword"');process.exit(1);}const hash=await bcrypt.hash(password,12);const db=getPool();try{await db.execute("INSERT INTO App_User(Name,Email,Password_Hash,Role) VALUES(?,?,?,'Admin') ON DUPLICATE KEY UPDATE Name=VALUES(Name),Password_Hash=VALUES(Password_Hash),Role='Admin',Is_Active=1",[name,email,hash]);console.log('Admin account created/updated.');}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exit(1)});
