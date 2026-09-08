const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 5050;
const DATA = path.join(__dirname, "data.json");
const SECRET = "fresh-task-manager-2026";

if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify({users:[],tasks:[]}, null, 2));

const read = () => JSON.parse(fs.readFileSync(DATA, "utf8"));
const save = d => fs.writeFileSync(DATA, JSON.stringify(d, null, 2));

function hash(p) { return crypto.createHash("sha256").update(p).digest("hex"); }
function token() { return crypto.randomBytes(32).toString("hex"); }
const sessions = new Map();

function send(res, code, obj) {
  res.writeHead(code, {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise(resolve => {
    let s=""; req.on("data", c=>s+=c); req.on("end", ()=>{try{resolve(JSON.parse(s||"{}"))}catch{resolve({})}});
  });
}
function user(req) {
  const h=req.headers.authorization||"";
  return sessions.get(h.startsWith("Bearer ")?h.slice(7):"");
}
function id(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}

const api = async (req,res) => {
  if (req.method==="OPTIONS") { res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS"}); return res.end(); }
  const url=new URL(req.url,"http://localhost");
  const p=url.pathname;
  const d=read();

  if(req.method==="GET" && p==="/api/test") return send(res,200,{success:true,message:"Backend is working!"});

  if(req.method==="POST" && p==="/api/signup"){
    const b=await body(req), name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
    if(!name||!email||!password)return send(res,400,{success:false,message:"Please fill all fields."});
    if(password.length<6)return send(res,400,{success:false,message:"Password must be at least 6 characters."});
    if(d.users.some(u=>u.email===email))return send(res,409,{success:false,message:"Email already registered. Please login."});
    d.users.push({id:id(),name,email,password:hash(password)}); save(d);
    return send(res,201,{success:true,message:"Account created successfully!"});
  }

  if(req.method==="POST" && p==="/api/login"){
    const b=await body(req), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
    const u=d.users.find(x=>x.email===email);
    if(!u||u.password!==hash(password))return send(res,401,{success:false,message:"Invalid email or password."});
    const t=token(); sessions.set(t,u.id);
    return send(res,200,{success:true,token:t,user:{id:u.id,name:u.name,email:u.email}});
  }

  const u=user(req);
  if(!u)return send(res,401,{success:false,message:"Please login first."});

  if(req.method==="GET" && p==="/api/tasks")
    return send(res,200,{success:true,tasks:d.tasks.filter(t=>t.userId===u)});

  if(req.method==="POST" && p==="/api/tasks"){
    const b=await body(req), title=String(b.title||"").trim();
    if(!title)return send(res,400,{success:false,message:"Task cannot be empty."});
    const t={id:id(),userId:u,title,completed:false,createdAt:new Date().toISOString()};
    d.tasks.push(t);save(d);return send(res,201,{success:true,task:t});
  }

  const m=p.match(/^\/api\/tasks\/([^/]+)$/);
  if(m){
    const t=d.tasks.find(x=>x.id===m[1]&&x.userId===u);
    if(!t)return send(res,404,{success:false,message:"Task not found."});
    if(req.method==="PUT"){const b=await body(req);t.title=String(b.title||"").trim();if(!t.title)return send(res,400,{success:false,message:"Task cannot be empty."});}
    if(req.method==="PATCH"){const b=await body(req);t.completed=b.completed===true;}
    if(req.method==="DELETE"){d.tasks=d.tasks.filter(x=>x!==t);}
    save(d);return send(res,200,{success:true});
  }
  send(res,404,{success:false,message:"Not found."});
};

const server=http.createServer((req,res)=>{
  if(req.url.startsWith("/api/")) return api(req,res);
  let file=req.url==="/"?"/login.html":req.url.split("?")[0];
  let fp=path.join(__dirname,file);
  if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()) return res.writeHead(404).end("Not found");
  const ext=path.extname(fp), types={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json"};
  res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream"});
  fs.createReadStream(fp).pipe(res);
});
server.listen(PORT, "0.0.0.0", () => console.log(`TASK MANAGER READY on port ${PORT}`));
