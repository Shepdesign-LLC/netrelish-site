
/* ---------- Blog posts: add one object per post, newest first ---------- */
const POSTS = [
  { slug:'fun-to-be-in', date:'2026-11-18', tags:['Workbench'], title:'Your browser should be fun to be in',
    dek:'If you spend all day on a computer, the window you stare at should give a little energy back.',
    body:`<p>Most of my day happens in a browser. Client sites, invoices, a ticket queue, a recipe I'm never going to cook. Eight, nine hours of tabs. And the browser just sits there like a filing cabinet with a search bar.</p>
<p>I don't think it has to be that way. You can't always make the work fun. You can make the place you do it fun, and that changes more than you'd think.</p>
<h2>Tools change your mood</h2>
<p>A sharp knife makes you want to cook. A good keyboard makes you want to type. A desk with nothing on it makes you want to start something. The tools around us set our posture before we've done anything.</p>
<blockquote>If you're going to be on a computer all day doing boring stuff, the thing you look at all day should have some relish.</blockquote>
<p>So NetRelish has a shelf of jars instead of a wall of favicons. The tab you're working in gets a stripe of green under it. When a recipe runs clean, it notices. When you open the same four tabs every morning, it asks if you want it to do that for you.</p>
<h2>Small joys, all day</h2>
<p>None of this is a gimmick bolted on top. It's the same idea all the way down: your work is worth keeping, and keeping it should feel good. When your browser treats your stuff like it matters, you start treating it that way too.</p>
<p>That's the whole bet. Better tools, better attitude, more energy left at five o'clock.</p>` },
  { slug:'preserve-the-internet', date:'2026-11-16', tags:['Ideas'], title:'The internet is information. NetRelish preserves it.',
    dek:'A browser stores things for a while. A workbench saves them, understands them and puts them to work.',
    body:`<p>Here's the simplest way I can put it. The internet is just information. A browser stores that information for a little while, in history and caches, until it decides you're done with it.</p>
<p>NetRelish does something different with every page you open.</p>
<h2>It saves it</h2>
<p>Tabs go into Jars. When you stop using one, it sinks into Brine instead of closing. Your scroll position, the form you half filled out, the back button history, all still there.</p>
<h2>It understands it</h2>
<p>Everything in your Pantry is readable by NetRelish, on your Mac, with Apple Intelligence. Ask it a question and it answers from the pages you actually kept, with a link back to the source.</p>
<h2>It puts it to work</h2>
<p>Recipes replay the routines you do over and over. Saved information can feed them, so the pages you kept last month can do work for you this morning.</p>
<h2>It preserves it</h2>
<p>When you're done, you seal the jar. That's where things get interesting, and it gets <a href="#post-inside-a-sealed-jar" style="color:var(--zest-300)">its own post</a>.</p>` },
  { slug:'inside-a-sealed-jar', date:'2026-11-12', tags:['Sealing'], title:'What happens inside a sealed jar',
    dek:'Timestamps, summaries, tabs in their own rooms, and a recipe waiting on the shelf.',
    body:`<p>Sealing is my favorite part of NetRelish. It's the moment a pile of tabs becomes something you can trust and come back to.</p>
<h2>A snapshot of the open web</h2>
<p>When you seal a jar, every tab inside is kept in its initial state, exactly as it was on the open web at that moment. Pages change and links rot. Your sealed copy doesn't.</p>
<div class="aside"><b>sealed</b>     Tue Nov 17 · 4:12 PM
<b>tabs</b>       7
<b>check</b>      untouched since sealing
<b>summary</b>    Friday invoice run: 3 client invoices,
           payments, this week's time sheet
<b>recipe</b>     "Send invoices" · Run it now?</div>
<p>Every seal gets a timestamp and a summary. It's tamper-proof, so if anything inside changes, NetRelish can tell you. And when you open it again, it asks if you want to run the workflow it was made for.</p>
<h2>Tabs in their own rooms</h2>
<p>Inside a jar, every tab is isolated from the others. One page can't peek at another. They can still pass notes through the jar itself, which is how a recipe can take a number from one tab and drop it into a form in another.</p>
<h2>Then it ferments</h2>
<p>Here's the fun part. Stuff in a sealed jar doesn't just sit there. Over time NetRelish learns what's inside and how you use it. The information gets fluid again. It can come back to life to run a workflow, answer a question, or help NetRelish understand your needs, your patterns and what you're trying to get done.</p>
<blockquote>You don't just save the web. You preserve it, and it gets better with age.</blockquote>` },
  { slug:'meet-the-goofy-one', date:'2026-11-08', tags:['Personality'], title:'Meet the goofy one',
    dek:'NetRelish has a personality. He is curious, a little goofy, and he never forgets.',
    body:`<p>Every good tool has a character, whether its makers admit it or not. I decided to admit it.</p>
<p>NetRelish is curious. He wants to know what you're working on and how you like to work. He gets excited when you do, and he gets really excited when a recipe runs perfectly on the first try.</p>
<h2>He remembers so you don't have to</h2>
<p>Left a jar fermenting for three days? Half-filled a form and wandered off? He'll nudge you. Not with a guilt trip, just a little "hey, this is still here."</p>
<ul><li>He learns your workflow and offers to automate the boring parts.</li><li>He reminds you when you forget.</li><li>He never loses what you kept.</li></ul>
<h2>He respects himself</h2>
<p>That means respecting you. Your browsing stays on your Mac. Tabs don't snoop on each other. Sealed jars can't be quietly changed behind your back.</p>
<p>He may be a goofy tool, but he wants the internet to be better, safer and more trustworthy. He just doesn't think that has to be serious all the time. The internet could use some relish.</p>` }
];

const views = ['home','pro','blog','post','roadmap'];
const fmtDate = d => new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
document.getElementById('postList').innerHTML = POSTS.map(p=>`
  <a class="post-card" href="#post-${p.slug}"><time datetime="${p.date}">${fmtDate(p.date)}</time>
    <div><h3>${esc(p.title)}</h3><p>${esc(p.dek)}</p><div class="chips">${p.tags.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div></div>
    <span class="go" aria-hidden="true">→</span></a>`).join('');

/* ---------- Screenshot tabs ---------- */
const CAPS = [
  "Jars live on the shelf rail. The tab you're working in gets a little relish under it. And NetRelish notices your habits, then offers to save you the clicks.",
  "Open a sealed jar and you get the timestamp, a summary, proof nothing changed, and an offer to run the recipe it was made for.",
  "Ask the Pantry answers from the pages you actually kept, with links back to the source. It runs on your Mac with Apple Intelligence.",
  "Idle tabs sink into Brine instead of closing. Scroll position and half-filled forms are right where you left them."
];

/* ---------- v6: alive ---------- */
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
function cycler(btnSel, panelSel, capEl, caps, root, dwell){
  const btns=[...document.querySelectorAll(btnSel)], panels=[...document.querySelectorAll(panelSel)];
  let n=0, t=null, paused=false;
  function show(i){ n=i; btns.forEach((b,j)=>b.setAttribute('aria-selected', j===i)); panels.forEach((p,j)=>p.hidden=j!==i);
    if(capEl) capEl.textContent=caps[i]; root.querySelectorAll('[data-zf]').forEach((f,j)=>f.classList.toggle('on',j===i)); arm(); }
  function arm(){ clearTimeout(t); if(!RM && !paused) t=setTimeout(()=>show((n+1)%panels.length), dwell); }
  root.style.setProperty('--dwell', dwell+'ms');
  btns.forEach((b,i)=>b.addEventListener('click',()=>show(i)));
  root.addEventListener('mouseenter',()=>{paused=true;root.classList.add('paused');clearTimeout(t)});
  root.addEventListener('mouseleave',()=>{paused=false;root.classList.remove('paused');arm()});
  root.addEventListener('focusin',()=>{paused=true;clearTimeout(t)});
  return {show};
}
const tour = document.getElementById('tour');
cycler('#tour [data-shot]','#tour .mac',document.getElementById('shotCap'),CAPS,tour,7000);
const ZCAPS=["Zest Studio: color, type, spacing and radius built as a real system, with contrast audited as you go.",
 "ZestMail: drag blocks, edit text in place, switch brand and the whole email re-skins. Table-based HTML that survives Outlook.",
 "Zest MD: drop a Markdown file and read it typeset in your own skin. Export one HTML file, a PDF, or a link.",
 "ZestImage is in design: hero images, OG cards and social tiles from your tokens. One title renders every size."];
const fam=document.getElementById('family');
const zc=cycler('#family [data-zshot]','#family .zmac',document.getElementById('zCap'),ZCAPS,fam,6500);
document.getElementById('zCap').textContent=ZCAPS[0];
fam.querySelectorAll('[data-zf]').forEach(f=>{f.tabIndex=0;f.setAttribute('role','tab');f.addEventListener('click',()=>zc.show(+f.dataset.zf));f.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();zc.show(+f.dataset.zf)}})});
/* Workbench toast: NetRelish keeps talking */
const TOASTS=['<b style="color:var(--zest-300)">Psst.</b> You\'ve opened these 4 tabs every morning this week. Want me to make it a recipe?',
 '<b style="color:var(--zest-300)">Heads up.</b> The client launch is Friday. Your brief is still sitting in Brine.',
 '<b style="color:var(--zest-300)">Done!</b> That recipe ran perfectly. 3 invoices sent in 2 minutes. 🎉',
 '<b style="color:var(--zest-300)">Sealed.</b> "Client launch" is timestamped and untouched. I\'ll remember it.'];
const t0=document.querySelector('#shot-0 .toast span');
if(t0 && !RM){ let k=0; const live=t0.querySelector('.live').outerHTML; const box=t0.parentElement;
  setInterval(()=>{ if(document.getElementById('shot-0').hidden) return; box.classList.add('out');
    setTimeout(()=>{k=(k+1)%TOASTS.length; t0.innerHTML=TOASTS[k]+live; box.classList.remove('out');},450); },4200); }
/* Reveal on scroll */
if('IntersectionObserver' in window && !RM){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
  document.querySelectorAll('main section:not(.hero) > .wrap > *').forEach(el=>{el.classList.add('reveal');io.observe(el)});
}
/* Glow follows the cursor in the hero */
const hh=document.getElementById('homeHero');
if(hh && !RM) hh.addEventListener('pointermove',e=>{const r=hh.getBoundingClientRect();hh.style.setProperty('--mx',(e.clientX-r.left)+'px');hh.style.setProperty('--my',(e.clientY-r.top)+'px')});


/* ---------- Drawer ---------- */
const drawer = document.getElementById('drawer'), scrim = document.getElementById('scrim'), menuBtn = document.getElementById('menuBtn');
function setDrawer(open){
  drawer.classList.toggle('open', open); scrim.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', !open); menuBtn.setAttribute('aria-expanded', open);
  document.body.classList.toggle('locked', open);
  if (open) document.getElementById('drawerClose').focus();
}
menuBtn.addEventListener('click', () => setDrawer(true));
document.getElementById('drawerClose').addEventListener('click', () => { setDrawer(false); menuBtn.focus(); });
scrim.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', e => { if (e.key==='Escape' && drawer.classList.contains('open')) { setDrawer(false); menuBtn.focus(); } });
drawer.addEventListener('click', e => { if (e.target.closest('a')) setDrawer(false); });

/* ---------- Router ---------- */
const sectionAnchors = {'tour':'home','how':'home','features':'home','personality':'home','waitlist-home':'home','family':'home','plans':'pro','compare':'pro','waitlist-pro':'pro','requests':'roadmap'};
function route(){
  const h = (location.hash||'#home').slice(1) || 'home';
  let view = h, anchor = null;
  if (h.startsWith('post-')) view = 'post';
  else if (h==='workbench' || h==='blog') view = 'blog';
  else if (sectionAnchors[h]) { view = sectionAnchors[h]; anchor = h; }
  else if (!views.includes(h)) view = 'home';
  views.forEach(v => document.getElementById('view-'+v).hidden = v !== view);
  const navKey = view==='post' ? 'blog' : (anchor==='family' ? 'family' : view);
  document.querySelectorAll('[data-route]').forEach(a => a.dataset.route === navKey ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'));
  if (view === 'post') {
    const p = POSTS.find(x => 'post-'+x.slug === h);
    document.getElementById('postBody').innerHTML = p ? `<a class="back" href="#workbench">← The Workbench</a><div class="kicker">${p.tags.map(esc).join(' · ')}</div><h1>${esc(p.title)}</h1><div class="meta">${fmtDate(p.date)} · Ryan Shepherd</div><div class="body">${p.body}</div>` : `<a class="back" href="#workbench">← All posts</a><h1>Post not found</h1>`;
  }
  setDrawer(false);
  if (anchor) requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView());
  else window.scrollTo(0,0);
}
window.addEventListener('hashchange', route);

/* ---------- Waitlist: posts to /api/join, which adds the email to Bento. ---------- */
document.querySelectorAll('.wl-form').forEach(form => form.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = form.nextElementSibling, btn = form.querySelector('button'), email = form.email.value.trim();
  msg.className = 'form-msg'; msg.textContent = '';
  if (!email || !form.email.checkValidity()) { msg.className='form-msg err'; msg.textContent='Enter a valid email address.'; return; }
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const r = await fetch(form.dataset.endpoint, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,source:'netrelish-'+form.dataset.source})});
    if (!r.ok) throw new Error(r.statusText);
    msg.textContent = "You're on the list. You'll hear from me when it opens."; form.reset();
  } catch { msg.className='form-msg err'; msg.textContent='That did not go through. Try again in a minute.'; }
  finally { btn.disabled = false; btn.textContent = 'Notify me'; }
}));

route();
