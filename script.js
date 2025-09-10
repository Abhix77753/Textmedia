// script.js — big feature set in vanilla JS
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy,
  doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, where, getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* ---------- CONFIG: replace with your Firebase values ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyB1BoVi4GzhoneHWhK36QrmS602DR5zH_E",
  authDomain: "abhilashks-f7d2b.firebaseapp.com",
  projectId: "abhilashks-f7d2b",
  storageBucket: "abhilashks-f7d2b.firebasestorage.app",
  messagingSenderId: "419691577962",
  appId: "1:419691577962:web:5c7eb2b102a4140fe08013"
};
/* ---------------------------------------------------------------- */

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM refs
const screen = document.getElementById("screen");
const stories = document.getElementById("stories");
const modalRoot = document.getElementById("modalRoot");
const navBtns = Array.from(document.querySelectorAll(".navbtn"));
const notifBadge = document.getElementById("notifBadge");

let currentUser = null;
let userDocCache = {}; // cache user docs

// initialize UI stories
const seedStories = ["Your Story","News","Tips","Community","Updates","Friends"];
stories.innerHTML = seedStories.map(s=>`<div class="story-pill">${s}</div>`).join("");

// navigation helper
function setActiveTab(tab){
  navBtns.forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  renderTab(tab);
}
navBtns.forEach(b=>b.addEventListener("click", ()=> setActiveTab(b.dataset.tab)));
setActiveTab("home");

// auth + create minimal user doc
signInAnonymously(auth).then(()=>console.log("[auth] signed in")).catch(e=>console.warn(e));
onAuthStateChanged(auth, async (u)=>{
  if(u){
    currentUser = { uid: u.uid, isAnonymous: u.isAnonymous };
    console.log("[auth] user:", currentUser.uid);
    // ensure user doc exists
    const udRef = doc(db, "users", currentUser.uid);
    const s = await getDoc(udRef);
    if(!s.exists()){
      await setDoc(udRef, { username: `guest_${currentUser.uid.slice(0,6)}`, bio: "", followers: [], following: [], createdAt: serverTimestamp() });
    }
    const ud = await getDoc(udRef);
    userDocCache[currentUser.uid] = ud.data();
    // start notifications listener (simple count)
    listenNotifications();
  } else {
    currentUser = null;
  }
});

// ---------- Renderers for tabs ----------

function renderTab(tab){
  if(tab==="home") return renderHome();
  if(tab==="search") return renderSearch();
  if(tab==="compose") return renderCompose();
  if(tab==="messages") return renderMessages();
  if(tab==="profile") return renderProfile();
  screen.innerHTML = "<div class='card'>Unknown tab</div>";
}

/* HOME: feed with live posts */
function renderHome(){
  screen.innerHTML = `<div id="feed"></div>`;
  const feed = document.getElementById("feed");
  feed.innerHTML = `<div class="small">Loading feed…</div>`;

  const q = query(collection(db,"posts"), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    const items = [];
    snap.forEach(d=>items.push({ id: d.id, ...d.data() }));
    feed.innerHTML = items.map(postCardHtml).join("") || `<div class="card small">No posts yet — create the first one.</div>`;
    // wire up like/follow buttons after render
    wirePostButtons();
  });
}

function postCardHtml(p){
  const ts = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "";
  const likes = Array.isArray(p.likes) ? p.likes.length : (p.likes || 0);
  return `
  <article class="card" data-post-id="${p.id}">
    <div class="meta">
      <div class="row">
        <div class="avatar">${(p.authorName||"A").charAt(0).toUpperCase()}</div>
        <div style="margin-left:8px">
          <div style="font-weight:600">${escapeHtml(p.authorName||"Anon")}</div>
          <div class="small">${ts}</div>
        </div>
      </div>
      <div class="small post-menu">⋯</div>
    </div>
    <div class="text">${escapeHtml(p.text)}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn likeBtn">❤ <span class="likeCount">${likes}</span></button>
      <button class="btn commentBtn" style="background:#4b5563">Comment</button>
      <div style="margin-left:auto" class="small">ID: ${p.id.slice(0,6)}</div>
    </div>
  </article>`;
}

function wirePostButtons(){
  document.querySelectorAll("[data-post-id]").forEach(el=>{
    const postId = el.dataset.postId;
    const likeBtn = el.querySelector(".likeBtn");
    likeBtn.onclick = async ()=>{
      await toggleLike(postId);
    };
    const commentBtn = el.querySelector(".commentBtn");
    commentBtn.onclick = ()=> openCommentsModal(postId);
  });
}

/* COMMENT modal (simple) */
function openCommentsModal(postId){
  const modal = createModal();
  modal.panel.innerHTML = `<div style="font-weight:700">Comments — ${postId.slice(0,6)}</div>
    <div id="commentsList" style="margin-top:8px" class="small">Loading…</div>
    <div style="margin-top:12px" class="row">
      <input id="commentInput" class="input" placeholder="Write a comment" />
      <button id="sendComment" class="btn">Send</button>
    </div>`;
  // list comments (simple collection posts/{id}/comments)
  const commentsRef = collection(db, "posts", postId, "comments");
  onSnapshot(commentsRef, snap=>{
    const arr=[];
    snap.forEach(d=>arr.push(d.data()));
    const list = modal.panel.querySelector("#commentsList");
    list.innerHTML = arr.map(c=>`<div class="card small"><strong>${escapeHtml(c.author||'Anon')}</strong> — ${escapeHtml(c.text)}</div>`).join("") || "<div class='small'>No comments</div>";
  });
  modal.panel.querySelector("#sendComment").addEventListener("click", async ()=>{
    const txtEl = modal.panel.querySelector("#commentInput");
    const t = txtEl.value.trim(); if(!t) return;
    await addDoc(collection(db, "posts", postId, "comments"), { text: t, author: userDocCache[currentUser.uid]?.username || 'guest', createdAt: serverTimestamp() });
    txtEl.value = "";
  });
}

/* Like/unlike */
async function toggleLike(postId){
  if(!currentUser) return alert("Sign in first (anonymous auto sign-in should run)");
  const postRef = doc(db, "posts", postId);
  const pSnap = await getDoc(postRef);
  if(!pSnap.exists()) return;
  const p = pSnap.data();
  const likes = p.likes || [];
  if(likes.includes(currentUser.uid)){
    // unlike
    await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
  } else {
    await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
    // add notification
    await addDoc(collection(db,"notifications"), { to: p.authorId, from: currentUser.uid, type: "like", postId, createdAt: serverTimestamp(), read:false });
  }
}

/* COMPOSE: post + ask AI */
function renderCompose(){
  screen.innerHTML = `
    <div class="card composer">
      <div class="row"><div style="font-weight:700">Create post</div><small style="margin-left:auto">Posting as ${userDocCache[currentUser?.uid]?.username||'guest'}</small></div>
      <textarea id="postText" class="input" placeholder="Share your thought..."></textarea>
      <div class="row">
        <button id="postBtn" class="btn">Post</button>
        <button id="aiBtn" class="btn" style="background:#4b5563">Ask AI</button>
      </div>
      <div id="aiResult" class="card small" style="display:none;margin-top:8px"></div>
    </div>
  `;
  document.getElementById("postBtn").onclick = onCreatePost;
  document.getElementById("aiBtn").onclick = onAskAI;
}

async function onCreatePost(){
  if(!currentUser) return alert("Not signed in");
  const txt = document.getElementById("postText").value.trim();
  if(!txt) return alert("Write something");
  try{
    const udoc = userDocCache[currentUser.uid] || {};
    await addDoc(collection(db,"posts"), { text: txt, authorId: currentUser.uid, authorName: udoc.username || 'guest', createdAt: serverTimestamp(), likes: [] });
    document.getElementById("postText").value = "";
    setActiveTab("home");
  }catch(e){ console.error(e); alert("Could not create post: "+e.message) }
}

/* Ask AI - calls server proxy /api/ai */
async function onAskAI(){
  const txt = document.getElementById("postText").value.trim();
  if(!txt) return alert("Type prompt in the text area first");
  const resultEl = document.getElementById("aiResult");
  resultEl.style.display = "block";
  resultEl.textContent = "Thinking…";
  try{
    const r = await fetch("/api/ai", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ prompt: txt }) });
    if(!r.ok){ const t=await r.text(); throw new Error(t) }
    const data = await r.json();
    resultEl.textContent = data.reply || "(no reply)";
  }catch(e){
    console.error("[AI] error", e);
    resultEl.textContent = "AI error: "+e.message;
  }
}

/* SEARCH / EXPLORE */
async function renderSearch(){
  screen.innerHTML = `<div class="card"><div style="font-weight:700">Explore</div><div class="small" style="margin-top:8px">Trending text posts</div><div id="exploreList" style="margin-top:12px"></div></div>`;
  // simple: top posts by likes
  const postsRef = collection(db,"posts");
  const postsSnap = await getDocs(postsRef);
  const arr = [];
  postsSnap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
  arr.sort((a,b)=>(b.likes?.length||0)-(a.likes?.length||0));
  const list = document.getElementById("exploreList");
  list.innerHTML = arr.slice(0,10).map(p=>`<div class="card small"><strong>${escapeHtml(p.authorName||'Anon')}</strong> — ${escapeHtml(p.text.slice(0,120))}</div>`).join("") || `<div class="small">No posts</div>`;
}

/* MESSAGES */
function renderMessages(){
  screen.innerHTML = `<div class="card"><div style="font-weight:700">Messages</div><div class="small" style="margin-top:8px">Simple global chat (demo)</div><div id="msgList" style="margin-top:12px"></div>
  <div style="margin-top:12px" class="row"><input id="msgInput" class="input" placeholder="Send a global message" /><button id="msgSend" class="btn">Send</button></div></div>`;
  const msgList = document.getElementById("msgList");
  const q = query(collection(db,"messages"), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    const arr=[];
    snap.forEach(d=>arr.push(d.data()));
    msgList.innerHTML = arr.map(m=>`<div class="card small"><strong>${escapeHtml(m.fromName||'Anon')}</strong>: ${escapeHtml(m.text)}</div>`).join("");
  });
  document.getElementById("msgSend").onclick = async ()=>{
    const txt = document.getElementById("msgInput").value.trim(); if(!txt) return;
    await addDoc(collection(db,"messages"), { text: txt, from: currentUser.uid, fromName: userDocCache[currentUser.uid]?.username || 'guest', createdAt: serverTimestamp() });
    document.getElementById("msgInput").value = "";
  };
}

/* PROFILE: view own profile (no public other profiles per your request) */
async function renderProfile(){
  // refresh userDoc
  const udRef = doc(db,"users", currentUser.uid);
  const udSnap = await getDoc(udRef);
  const ud = udSnap.exists() ? udSnap.data() : { username: 'guest', bio: '' };
  userDocCache[currentUser.uid] = ud;

  screen.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="row">
          <div class="avatar" style="width:64px;height:64px;font-size:22px">${(ud.username||'A').charAt(0).toUpperCase()}</div>
          <div style="margin-left:12px">
            <div style="font-weight:700;font-size:18px">${escapeHtml(ud.username)}</div>
            <div class="small">${escapeHtml(ud.bio||'No bio')}</div>
          </div>
        </div>
        <div>
          <button id="editProfileBtn" class="btn">Edit profile</button>
        </div>
      </div>
      <div style="margin-top:12px" class="row small">
        <div><strong id="postCount">${ud.postCount||0}</strong><div class="small">posts</div></div>
        <div style="margin-left:12px"><button id="followersBtn" class="btn" style="background:transparent;border:1px solid rgba(255,255,255,0.06)">${(ud.followers?.length||0)} followers</button></div>
        <div style="margin-left:12px"><button id="followingBtn" class="btn" style="background:transparent;border:1px solid rgba(255,255,255,0.06)">${(ud.following?.length||0)} following</button></div>
      </div>
    </div>
    <div id="myPosts"></div>
  `;
  document.getElementById("editProfileBtn").onclick = ()=> openEditProfileModal(ud);
  document.getElementById("followersBtn").onclick = ()=> openFollowerListModal('followers');
  document.getElementById("followingBtn").onclick = ()=> openFollowerListModal('following');

  // render user's posts
  const q = query(collection(db,"posts"), where("authorId","==",currentUser.uid), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    const arr=[]; snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
    document.getElementById("myPosts").innerHTML = arr.map(p=>postCardHtml(p)).join("") || `<div class="card small">No posts yet</div>`;
    wirePostButtons();
  });
}

/* Edit profile modal */
function openEditProfileModal(ud){
  const modal = createModal();
  modal.panel.innerHTML = `
    <div style="font-weight:700">Edit profile</div>
    <div class="small" style="margin-top:8px">Change username & bio</div>
    <div style="margin-top:12px">
      <input id="editUsername" class="input" value="${escapeHtml(ud.username||'')}" placeholder="username" />
      <textarea id="editBio" class="input" style="margin-top:8px" placeholder="bio">${escapeHtml(ud.bio||'')}</textarea>
      <div style="margin-top:12px" class="row">
        <button id="saveProfile" class="btn">Save</button>
        <button id="cancelProfile" class="btn" style="background:#4b5563">Cancel</button>
      </div>
    </div>
  `;
  modal.panel.querySelector("#cancelProfile").onclick = modal.close;
  modal.panel.querySelector("#saveProfile").onclick = async ()=>{
    const newName = modal.panel.querySelector("#editUsername").value.trim();
    const newBio = modal.panel.querySelector("#editBio").value.trim();
    if(!newName) return alert("Username cannot be empty");
    // update user doc
    await updateDoc(doc(db,"users",currentUser.uid), { username: newName, bio: newBio });
    userDocCache[currentUser.uid] = { ...userDocCache[currentUser.uid], username: newName, bio: newBio };
    modal.close();
    renderProfile();
  };
}

/* Followers / Following modal */
async function openFollowerListModal(kind){
  // kind === 'followers' or 'following'
  const udRef = doc(db,"users",currentUser.uid);
  const udSnap = await getDoc(udRef);
  const ud = udSnap.data();
  const list = ud[kind] || [];
  const modal = createModal();
  modal.panel.innerHTML = `<div style="font-weight:700">${kind === 'followers' ? 'Followers' : 'Following'}</div><div id="listWrap" style="margin-top:12px"></div>`;
  const wrap = modal.panel.querySelector("#listWrap");
  if(list.length===0){ wrap.innerHTML = `<div class="small">No ${kind}</div>`; return; }
  // fetch usernames for ids
  const promises = list.map(id => getDoc(doc(db,"users",id)).then(s=> ({ id, username: s.exists() ? s.data().username : ('user_'+id.slice(0,6)) }) ));
  const users = await Promise.all(promises);
  wrap.innerHTML = users.map(u => `<div class="card small" data-uid="${u.id}"><div class="row"><div style="font-weight:600">${escapeHtml(u.username)}</div><div style="margin-left:auto"><button class="btn followToggle" data-uid="${u.id}">Follow/Unfollow</button></div></div></div>`).join("");
  // wire follow/unfollow
  wrap.querySelectorAll(".followToggle").forEach(btn=>{
    btn.onclick = async (ev)=>{
      const uid = btn.dataset.uid;
      await toggleFollow(uid);
      btn.textContent = "Updated";
      setTimeout(()=>renderProfile(),300);
    };
  });
}

/* Follow/Unfollow logic: we update both users' docs (followers, following) */
async function toggleFollow(targetUid){
  if(!currentUser) return alert("Not signed in");
  const meRef = doc(db,"users",currentUser.uid);
  const targetRef = doc(db,"users",targetUid);
  const meSnap = await getDoc(meRef);
  const tSnap = await getDoc(targetRef);
  if(!tSnap.exists()) return alert("User not found");
  const me = meSnap.data();
  const t = tSnap.data();
  const following = me.following || [];
  if(following.includes(targetUid)){
    // unfollow
    await updateDoc(meRef, { following: arrayRemove(targetUid) });
    await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
  } else {
    // follow
    await updateDoc(meRef, { following: arrayUnion(targetUid) });
    await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
    // create notification for target
    await addDoc(collection(db,"notifications"), { to: targetUid, from: currentUser.uid, type: "follow", createdAt: serverTimestamp(), read:false });
  }
}

/* Notifications: show simple unread count */
function listenNotifications(){
  if(!currentUser) return;
  const q = query(collection(db,"notifications"), where("to","==",currentUser.uid), where("read","==",false));
  onSnapshot(q, snap=>{
    const count = snap.size;
    if(count>0){ notifBadge.style.display = "inline-block"; notifBadge.textContent = count; } else notifBadge.style.display = "none";
  });
}

/* helper: create modal */
function createModal(){
  const wrap = document.createElement("div"); wrap.className = "modal";
  const panel = document.createElement("div"); panel.className = "panel"; wrap.appendChild(panel);
  modalRoot.appendChild(wrap);
  function close(){ wrap.remove(); }
  // clicking backdrop closes
  wrap.addEventListener("click", (e)=>{ if(e.target===wrap) close(); });
  return { root:wrap, panel, close };
}

/* utils */
function escapeHtml(s){ return (s||"").replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// attach setActiveTab globally (for quick buttons)
window.setActiveTab = setActiveTab;

// start: set up a few UI shortcuts
document.getElementById("composeQuick").addEventListener("click", ()=> setActiveTab("compose"));
document.getElementById("logoBtn").addEventListener("click", ()=> setActiveTab("home"));
document.getElementById("notifBtn").addEventListener("click", ()=>{
  // show notifications modal
  const modal = createModal();
  modal.panel.innerHTML = `<div style="font-weight:700">Notifications</div><div id="notifList" style="margin-top:12px">Loading…</div>`;
  const q = query(collection(db,"notifications"), where("to","==", currentUser?.uid || "none"), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    const arr=[]; snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
    const list = modal.panel.querySelector("#notifList");
    list.innerHTML = arr.map(n=>`<div class="card small">${n.type} from ${n.from?.slice?.(0,6) || 'someone'}</div>`).join("") || `<div class="small">No notifications</div>`;
  });
});

// initial render
setActiveTab("home");
console.log("[app] ready");