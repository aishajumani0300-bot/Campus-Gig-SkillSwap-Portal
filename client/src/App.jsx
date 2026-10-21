import React from "react";
import { useEffect, useState } from "react";

const API = "http://localhost:4000/api";
const categories = ["Programming", "Design", "Writing", "Tutoring"];
const paymentTypes = ["Paid", "SkillSwap", "Free"];
const money = (amount) => amount == null ? "No payment" : `Rs. ${Number(amount).toLocaleString()}`;
const pretty = (value) => value === "SkillSwap" ? "Skill swap" : value;
const todayLocal = () => new Date().toLocaleDateString("en-CA");

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function App() {
  const [users, setUsers] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [exploreGigs, setExploreGigs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentId, setCurrentId] = useState("u1");
  const [page, setPage] = useState("Explore");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("All");
  const [payment, setPayment] = useState("All");
  const [minBudget, setMinBudget] = useState("");
  const [budget, setBudget] = useState("");
  const [notice, setNotice] = useState({ text: "", kind: "success" });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "Offering", category: "Programming", payment_type: "Paid", budget: "1000", deadline: "2027-01-31" });
  const [applyMessages, setApplyMessages] = useState({});
  const [reviewDrafts, setReviewDrafts] = useState({});
  const currentUser = users.find(u => u.id === currentId);

  async function loadData() {
    const [u, g, a, r] = await Promise.all([
      request("/users"), request("/gigs"), request("/applications"), request("/reviews")
    ]);
    setUsers(u); setGigs(g); setApplications(a); setReviews(r);
  }

  useEffect(() => {
    loadData().catch(error => setNotice({ text: `Cannot connect to the API. Start the server first. ${error.message}`, kind: "error" }));
  }, []);

  // Explore page: ask the API to search and filter.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (category !== "All") params.set("category", category);
    if (type !== "All") params.set("type", type);
    if (payment !== "All") params.set("payment_type", payment);
    if (minBudget) params.set("minBudget", minBudget);
    if (budget) params.set("maxBudget", budget);
    request(`/gigs?${params.toString()}`)
      .then(setExploreGigs)
      .catch(error => setNotice({ text: error.message, kind: "error" }));
  }, [search, category, type, payment, minBudget, budget, refreshKey]);

  const filteredGigs = exploreGigs;

  function notify(text, kind = "success") {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice({ text: "", kind: "success" }), 4200);
  }

  async function runAction(action) {
    setBusy(true);
    try {
      await action();
      await loadData();
      setRefreshKey(k => k + 1);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function createGig(event) {
    event.preventDefault();
    await runAction(async () => {
      await request("/gigs", { method: "POST", body: JSON.stringify({
        ...form, user_id: currentId,
        budget: form.payment_type === "Paid" ? Number(form.budget) : null
      }) });
      setForm({ title: "", description: "", type: "Offering", category: "Programming", payment_type: "Paid", budget: "1000", deadline: "2027-01-31" });
      setPage("Explore");
      notify("Your gig was posted!");
    });
  }

  async function applyToGig(gig) {
    const message = (applyMessages[gig.id] || "").trim();
    if (!message) {
      notify("Please write a short message before applying.", "error");
      return;
    }
    await runAction(async () => {
      await request("/applications", { method: "POST", body: JSON.stringify({ gig_id: gig.id, applicant_id: currentId, message }) });
      setApplyMessages(old => ({ ...old, [gig.id]: "" }));
      notify("Application submitted!");
    });
  }

  async function manageApplication(application, status) {
    await runAction(async () => {
      await request(`/applications/${application.id}`, { method: "PATCH", body: JSON.stringify({ status, owner_id: currentId }) });
      notify(`Application ${status.toLowerCase()}.`);
    });
  }

  async function changeGigStatus(gig, status) {
    await runAction(async () => {
      await request(`/gigs/${gig.id}`, { method: "PATCH", body: JSON.stringify({ status, owner_id: currentId }) });
      notify(`Gig marked ${status.toLowerCase()}.`);
    });
  }

  async function submitReview(gig) {
    const draft = reviewDrafts[gig.id] || { rating: "5", comment: "" };
    await runAction(async () => {
      await request("/reviews", { method: "POST", body: JSON.stringify({ gig_id: gig.id, reviewer_id: currentId, rating: Number(draft.rating), comment: draft.comment }) });
      notify("Review submitted. Thank you!");
    });
  }

  const myApplications = applications.filter(a => a.applicant_id === currentId);
  const myGigs = gigs.filter(g => g.user_id === currentId);
  const stats = [
    { label: "Open gigs", value: gigs.filter(g => g.status === "Open").length, icon: "◉" },
    { label: "Students", value: users.length, icon: "♙" },
    { label: "Applications", value: applications.length, icon: "↗" },
    { label: "Reviews", value: reviews.length, icon: "★" }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">C</div><div><strong>CampusGig</strong><small>Skills make community</small></div></div>
        <div className="side-label">WORKSPACE</div>
        {["Explore", "Post a gig", "My activity", "My profile"].map(item =>
          <button key={item} className={`nav-link ${page === item ? "active" : ""}`} onClick={() => setPage(item)}>
            <span>{({ Explore: "⌕", "Post a gig": "+", "My activity": "▤", "My profile": "♙" })[item]}</span>{item}
          </button>
        )}
        <div className="sidebar-bottom"><div className="online-dot"/> Campus community <span className="beta">BETA</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><div className="eyebrow">STUDENT MARKETPLACE</div><h1>{page === "Explore" ? "Find your next opportunity" : page}</h1></div>
          <label className="profile-switch"><span>Viewing as</span><select value={currentId} onChange={e => setCurrentId(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select><div className="avatar">{currentUser?.name?.[0] || "S"}</div></label>
        </header>

        {notice.text && <div className={`notice ${notice.kind}`}>{notice.text}<button onClick={() => setNotice({ text: "", kind: "success" })}>×</button></div>}

        {page === "Explore" && <>
          <section className="hero">
            <div className="hero-copy"><span className="hero-chip">✦ YOUR CAMPUS, YOUR COMMUNITY</span><h2>Good skills deserve<br/>great opportunities.</h2><p>Find help, share what you know, and grow together — one gig at a time.</p><button className="primary-button" onClick={() => setPage("Post a gig")}>＋ Post a gig</button></div>
            <div className="hero-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card card-back">✦ <span>Skill swap</span></div><div className="art-card card-front"><div className="art-avatar">↗</div><strong>Skills shared.</strong><small>Community grown.</small><div className="art-stars">★★★★★</div></div><div className="float-dot dot-one">✦</div><div className="float-dot dot-two">↗</div></div>
          </section>
          <section className="stats-grid">{stats.map(s => <div className="stat-card" key={s.label}><div className="stat-icon">{s.icon}</div><div><strong>{s.value}</strong><span>{s.label}</span></div></div>)}</section>
          <section className="section-heading"><div><div className="eyebrow">MADE FOR STUDENTS</div><h2>Explore campus gigs</h2><p>Find a project that matches your skills and schedule.</p></div><button className="text-button" onClick={() => {setSearch("");setCategory("All");setType("All");setPayment("All");setBudget("");setMinBudget("");}}>Clear filters ↗</button></section>
          <section className="filters">
            <label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search gigs or skills..." /></label>
            <select value={category} onChange={e => setCategory(e.target.value)}><option value="All">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
            <select value={type} onChange={e => setType(e.target.value)}><option value="All">Offering & requesting</option><option>Offering</option><option>Requesting</option></select>
            <select value={payment} onChange={e => setPayment(e.target.value)}><option value="All">All payment types</option>{paymentTypes.map(p => <option key={p} value={p}>{pretty(p)}</option>)}</select>
            <input className="budget-filter" type="number" min="0" value={minBudget} onChange={e => setMinBudget(e.target.value)} placeholder="Min Rs."/>
            <input className="budget-filter" type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Max Rs."/>
          </section>
          <div className="results-row"><span><strong>{filteredGigs.length}</strong> opportunities</span><span>Sorted by latest</span></div>
          <section className="gig-grid">
            {filteredGigs.map(gig => {
              const alreadyApplied = applications.some(a => a.gig_id === gig.id && a.applicant_id === currentId);
              const isOwner = gig.user_id === currentId;
              const mine = applications.filter(a => a.gig_id === gig.id);
              return <article className="gig-card" key={gig.id}>
                <div className="gig-card-top"><span className={`category-icon ${gig.category.toLowerCase()}`}>{({Programming:"⌘",Design:"✳",Writing:"✎",Tutoring:"▤"})[gig.category]}</span><span className={`status-pill ${gig.status.toLowerCase().replace(" ","-")}`}>{gig.status}</span></div>
                <div className="gig-meta">{gig.category} <span>·</span> {gig.type}</div>
                <h3>{gig.title}</h3><p className="gig-description">{gig.description}</p>
                <div className="gig-owner"><div className="mini-avatar">{gig.owner?.name?.[0] || "S"}</div><div><strong>{gig.owner?.name || "Student"}</strong><small>{gig.owner?.major || "Campus student"}</small></div></div>
                <div className="gig-details"><span className={`payment-tag ${gig.payment_type.toLowerCase()}`}>{pretty(gig.payment_type)}</span><strong>{gig.payment_type === "Paid" ? money(gig.budget) : gig.payment_type === "Free" ? "Volunteer" : "Exchange skills"}</strong></div>
                <div className="gig-footer"><span>◷ Due {gig.deadline}</span><span>{mine.length} applicant{mine.length === 1 ? "" : "s"}</span></div>
                {!isOwner && gig.status === "Open" && <div className="apply-area">{alreadyApplied ? <div className="applied-message">✓ Application sent</div> : <><textarea value={applyMessages[gig.id] || ""} onChange={e => setApplyMessages(old => ({...old,[gig.id]:e.target.value}))} placeholder="Why are you a good fit?" rows="2"/><button className="primary-button full" disabled={busy} onClick={() => applyToGig(gig)}>Apply to gig ↗</button></>}</div>}
                {isOwner && <div className="owner-note">Your gig · Manage in My activity</div>}
                {isOwner && gig.status === "In Progress" && <button className="outline-button full" disabled={busy} onClick={() => changeGigStatus(gig,"Completed")}>Mark completed ✓</button>}
              </article>;
            })}
          </section>
          {filteredGigs.length === 0 && <div className="empty-state"><div>⌕</div><h3>No gigs found</h3><p>Try changing your search or filters.</p></div>}
        </>}

        {page === "Post a gig" && <section className="form-layout"><div className="form-intro"><div className="eyebrow">CREATE AN OPPORTUNITY</div><h2>Share a skill.<br/>Find your people.</h2><p>Post a service you can offer or request help from fellow students.</p><div className="tip-card"><strong>✦ Helpful tip</strong><p>Use a clear title, explain the task, and set a realistic deadline so students know how they can help.</p></div></div><form className="panel-form" onSubmit={createGig}><h2>Gig details</h2><p className="muted">Fields marked * are required.</p><label>Gig title *<input required maxLength="100" value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="e.g. Design a poster for our society"/></label><label>Description *<textarea required minLength="10" value={form.description} onChange={e => setForm({...form,description:e.target.value})} placeholder="Describe the work, skills needed, and expected result..." rows="4"/></label><div className="two-fields"><label>I'm *<select value={form.type} onChange={e => setForm({...form,type:e.target.value})}><option>Offering</option><option>Requesting</option></select></label><label>Category *<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Payment type *<select value={form.payment_type} onChange={e => setForm({...form,payment_type:e.target.value,budget:e.target.value==="Paid"?"1000":""})}><option value="Paid">Paid</option><option value="SkillSwap">Skill swap</option><option value="Free">Free / volunteer</option></select></label>{form.payment_type === "Paid" && <label>Budget in PKR *<input required type="number" min="1" value={form.budget} onChange={e => setForm({...form,budget:e.target.value})}/></label>}<label>Deadline *<input required type="date" min={todayLocal()} value={form.deadline} onChange={e => setForm({...form,deadline:e.target.value})}/></label><button className="primary-button full" disabled={busy}>Publish gig ↗</button></form></section>}

        {page === "My activity" && <section className="activity-layout"><div className="section-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h2>Your gigs and applications</h2><p>Review applications and track your progress.</p></div></div><div className="activity-columns"><div className="activity-panel"><h3>Gigs you posted <span>{myGigs.length}</span></h3>{myGigs.length===0 && <p className="muted">You haven't posted a gig yet.</p>}{myGigs.map(g => <div className="activity-item" key={g.id}><div className="activity-item-main"><strong>{g.title}</strong><small>{g.status} · {g.category}</small></div>{g.status==="In Progress" && <button className="small-button" disabled={busy} onClick={()=>changeGigStatus(g,"Completed")}>Complete</button>}{g.status==="Open" && <button className="small-button danger" disabled={busy} onClick={()=>changeGigStatus(g,"Cancelled")}>Cancel</button>}<div className="application-list">{applications.filter(a=>a.gig_id===g.id).map(a=><div className="application-row" key={a.id}><div><strong>{a.applicant?.name || a.applicant_id}</strong><p>{a.message}</p><small className={`application-status ${a.status.toLowerCase()}`}>{a.status}</small></div>{g.status==="Open" && a.status==="Pending" && <div className="action-buttons"><button disabled={busy} onClick={()=>manageApplication(a,"Accepted")}>Accept</button><button className="reject" disabled={busy} onClick={()=>manageApplication(a,"Rejected")}>Reject</button></div>}</div>)}</div></div>)}</div><div className="activity-panel"><h3>Your applications <span>{myApplications.length}</span></h3>{myApplications.length===0 && <p className="muted">You haven't applied to any gigs yet.</p>}{myApplications.map(a=><div className="activity-item" key={a.id}><div className="activity-item-main"><strong>{a.gig?.title || a.gig_id}</strong><small>Owner: {users.find(u=>u.id===a.gig?.user_id)?.name || "Student"}</small></div><span className={`application-status ${a.status.toLowerCase()}`}>{a.status}</span></div>)}</div></div></section>}

        {page === "My profile" && currentUser && <section className="profile-page"><div className="profile-cover"/><div className="profile-card"><div className="profile-avatar">{currentUser.name[0]}</div><div className="profile-info"><div className="eyebrow">STUDENT PROFILE</div><h2>{currentUser.name}</h2><p>{currentUser.major} · Semester {currentUser.semester}</p><p>{currentUser.bio}</p><div className="skill-list">{currentUser.skills.map(s=><span key={s}>{s}</span>)}</div></div><div className="rating-box"><strong>{currentUser.average_rating ?? "—"} <span>★</span></strong><small>{reviews.filter(r=>r.reviewee_id===currentId).length} reviews</small></div></div><div className="profile-stats"><div><strong>{currentUser.gigs_posted}</strong><span>Gigs posted</span></div><div><strong>{currentUser.gigs_completed}</strong><span>Gigs completed</span></div><div><strong>{myApplications.length}</strong><span>Applications</span></div></div><div className="activity-panel reviews-panel"><h3>Reviews about you</h3>{reviews.filter(r=>r.reviewee_id===currentId).map(r=><div className="review-item" key={r.id}><div className="review-stars">{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</div><p>{r.comment}</p><small>From {r.reviewer?.name || r.reviewer_id} · {r.gig?.title}</small></div>)}{reviews.filter(r=>r.reviewee_id===currentId).length===0 && <p className="muted">No reviews yet. Complete a gig to build your reputation.</p>}</div><div className="activity-panel reviews-panel"><h3>Leave a review</h3>{gigs.filter(g=>g.status==="Completed" && [g.user_id,g.accepted_applicant_id].includes(currentId) && !reviews.some(r=>r.gig_id===g.id && r.reviewer_id===currentId)).map(g=><div className="review-compose" key={g.id}><strong>{g.title}</strong><select value={reviewDrafts[g.id]?.rating || "5"} onChange={e=>setReviewDrafts(old=>({...old,[g.id]:{rating:e.target.value,comment:old[g.id]?.comment||""}}))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select><input placeholder="Write a short review..." value={reviewDrafts[g.id]?.comment||""} onChange={e=>setReviewDrafts(old=>({...old,[g.id]:{rating:old[g.id]?.rating||"5",comment:e.target.value}}))}/><button className="small-button" disabled={busy} onClick={()=>submitReview(g)}>Submit</button></div>)}{gigs.filter(g=>g.status==="Completed" && [g.user_id,g.accepted_applicant_id].includes(currentId) && !reviews.some(r=>r.gig_id===g.id && r.reviewer_id===currentId)).length===0 && <p className="muted">No completed gigs waiting for your review.</p>}</div></section>}

        <footer className="footer"><span>© 2026 CampusGig · Built for students, by students.</span><span>Made for collaboration <b>✦</b></span></footer>
      </main>
    </div>
  );
}

export default App;