"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const schedules = {
  school: {
    label: "School year 2026-2027",
    locations: {
      Vacaville: [
        { day: "Monday", start: "3:00 PM", length: 30, status: "open" },
        { day: "Monday", start: "3:30 PM", length: 45, status: "held" },
        { day: "Wednesday", start: "4:15 PM", length: 45, status: "open" },
        { day: "Friday", start: "5:00 PM", length: 60, status: "open" },
        { day: "Friday", start: "6:15 PM", length: 30, status: "open" }
      ],
      Davis: [
        { day: "Tuesday", start: "3:00 PM", length: 45, status: "open" },
        { day: "Tuesday", start: "5:15 PM", length: 60, status: "held" },
        { day: "Thursday", start: "2:45 PM", length: 30, status: "open" },
        { day: "Thursday", start: "6:30 PM", length: 45, status: "open" },
        { day: "Saturday", start: "9:00 AM", length: 60, status: "open" }
      ]
    }
  },
  summer: {
    label: "Summer lesson block",
    locations: {
      Vacaville: [
        { day: "Monday", start: "10:00 AM", length: 45, status: "open" },
        { day: "Wednesday", start: "11:00 AM", length: 30, status: "open" },
        { day: "Friday", start: "1:00 PM", length: 60, status: "open" }
      ],
      Davis: [
        { day: "Tuesday", start: "9:30 AM", length: 30, status: "open" },
        { day: "Thursday", start: "10:15 AM", length: 45, status: "held" },
        { day: "Saturday", start: "12:00 PM", length: 60, status: "open" }
      ]
    }
  }
};

const initialForm = {
  term: "school",
  familyType: "returning",
  accessCode: "",
  parentName: "",
  email: "",
  studentName: "",
  lessonLength: "30",
  location: "Vacaville",
  firstChoice: "",
  secondChoice: "",
  thirdChoice: "",
  notes: ""
};

const initialAdminLogin = {
  email: "",
  password: ""
};

function slotLabel(slot) {
  return `${slot.day} at ${slot.start} (${slot.length} minutes)`;
}

function getAllSlots(term) {
  return Object.values(schedules[term].locations).flat();
}

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [adminFilter, setAdminFilter] = useState("pending");
  const [submitState, setSubmitState] = useState({ status: "idle", message: "" });
  const [adminLogin, setAdminLogin] = useState(initialAdminLogin);
  const [adminSession, setAdminSession] = useState(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [waitlistEntries, setWaitlistEntries] = useState([]);

  const filteredSlots = useMemo(() => {
    const slots = schedules[form.term].locations[form.location] || [];
    return slots.filter((slot) => slot.length === Number(form.lessonLength));
  }, [form.term, form.location, form.lessonLength]);

  const openSlots = filteredSlots.filter((slot) => slot.status === "open");
  const allSlots = getAllSlots(form.term);
  const openSlotsCount = allSlots.filter((slot) => slot.status === "open").length;
  const pendingCount = allSlots.filter((slot) => slot.status === "held").length;
  const isNewFamily = form.familyType === "new";
  const adminCards = useMemo(() => {
    if (adminFilter === "waitlist") {
      return [
        ...registrationRequests
          .filter((item) => item.status === "waitlist")
          .map((item) => ({
            id: item.id,
            table: "registration_requests",
            status: item.status,
            name: item.student_name,
            details: `${item.parent_name} was moved from registration requests to the waitlist.`,
            choices: [item.first_choice, item.second_choice, item.third_choice].filter(Boolean).join(" | ") || "No choices selected.",
            email: item.email,
            parentName: item.parent_name,
            notes: item.notes,
            createdAt: item.created_at
          })),
        ...waitlistEntries.map((item) => ({
          id: item.id,
          table: "waitlist_entries",
          status: item.status,
          name: item.student_name,
          details: `${item.parent_name} requested the waitlist for ${item.location}, ${item.lesson_length} minutes.`,
          choices: item.notes || "No notes provided.",
          email: item.email,
          createdAt: item.created_at
        }))
      ];
    }

    if (adminFilter === "trial") {
      return waitlistEntries
        .filter((item) => item.status === "trial")
        .map((item) => ({
          id: item.id,
          table: "waitlist_entries",
          status: item.status,
          name: item.student_name,
          details: `${item.parent_name} is in a 4-lesson trial for ${item.location}, ${item.lesson_length} minutes.`,
          choices: item.notes || "No notes provided.",
          email: item.email,
          createdAt: item.created_at
        }));
    }

    return registrationRequests
      .filter((item) => item.status === adminFilter)
      .map((item) => ({
        id: item.id,
        table: "registration_requests",
        status: item.status,
        name: item.student_name,
        details: `${item.family_type === "returning" ? "Returning" : "New"} student requesting ${item.location}, ${item.lesson_length} minutes.`,
        choices: [item.first_choice, item.second_choice, item.third_choice].filter(Boolean).join(" | ") || "No choices selected.",
        email: item.email,
        parentName: item.parent_name,
        notes: item.notes,
        createdAt: item.created_at
      }));
  }, [adminFilter, registrationRequests, waitlistEntries]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setAdminSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAdminSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (adminSession) {
      loadAdminData();
    }
  }, [adminSession]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (["term", "location", "lessonLength"].includes(name)) {
        next.firstChoice = "";
        next.secondChoice = "";
        next.thirdChoice = "";
      }
      return next;
    });
  }

  function updateAdminLogin(event) {
    const { name, value } = event.target;
    setAdminLogin((current) => ({ ...current, [name]: value }));
  }

  async function signInAdmin(event) {
    event.preventDefault();
    setAdminLoading(true);
    setAdminMessage("Signing in...");

    if (!isSupabaseConfigured || !supabase) {
      setAdminMessage("Supabase is not configured yet.");
      setAdminLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: adminLogin.email,
      password: adminLogin.password
    });

    if (error) {
      setAdminMessage(`Could not sign in: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    setAdminLogin(initialAdminLogin);
    setAdminMessage("Signed in.");
    setAdminLoading(false);
  }

  async function signOutAdmin() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRegistrationRequests([]);
    setWaitlistEntries([]);
    setAdminMessage("Signed out.");
  }

  async function loadAdminData() {
    if (!supabase) return;
    setAdminLoading(true);
    setAdminMessage("Loading requests...");

    const [registrationsResult, waitlistResult] = await Promise.all([
      supabase
        .from("registration_requests")
        .select("id, created_at, term, family_type, parent_name, email, student_name, lesson_length, location, first_choice, second_choice, third_choice, notes, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("waitlist_entries")
        .select("id, created_at, parent_name, email, student_name, lesson_length, location, notes, status")
        .order("created_at", { ascending: false })
    ]);

    if (registrationsResult.error || waitlistResult.error) {
      const errorMessage = registrationsResult.error?.message || waitlistResult.error?.message;
      setAdminMessage(`Could not load admin data: ${errorMessage}`);
      setAdminLoading(false);
      return;
    }

    setRegistrationRequests(registrationsResult.data || []);
    setWaitlistEntries(waitlistResult.data || []);
    setAdminMessage("Requests loaded.");
    setAdminLoading(false);
  }

  async function updateRequestStatus(item, nextStatus) {
    if (!supabase) return;
    setAdminLoading(true);
    setAdminMessage("Updating request...");

    const { error } = await supabase
      .from(item.table)
      .update({ status: nextStatus })
      .eq("id", item.id);

    if (error) {
      setAdminMessage(`Could not update request: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    await loadAdminData();
    setAdminMessage("Request updated.");
  }

  async function submitRequest(event) {
    event.preventDefault();
    setSubmitState({ status: "saving", message: "Saving your request..." });

    if (!isSupabaseConfigured || !supabase) {
      setSubmitState({
        status: "error",
        message: "Supabase is not configured yet. Add the project URL and publishable key to .env.local."
      });
      return;
    }

    const payload = {
      term: form.term,
      family_type: form.familyType,
      access_code: isNewFamily ? null : form.accessCode || null,
      parent_name: form.parentName,
      email: form.email,
      student_name: form.studentName,
      lesson_length: Number(form.lessonLength),
      location: form.location,
      first_choice: isNewFamily ? null : form.firstChoice || null,
      second_choice: isNewFamily ? null : form.secondChoice || null,
      third_choice: isNewFamily ? null : form.thirdChoice || null,
      notes: form.notes || null
    };

    const table = isNewFamily ? "waitlist_entries" : "registration_requests";
    const insertPayload = isNewFamily
      ? {
          parent_name: payload.parent_name,
          email: payload.email,
          student_name: payload.student_name,
          lesson_length: payload.lesson_length,
          location: payload.location,
          notes: payload.notes
        }
      : payload;

    const { error } = await supabase.from(table).insert(insertPayload);

    if (error) {
      setSubmitState({
        status: "error",
        message: `Supabase could not save this yet: ${error.message}`
      });
      return;
    }

    setSubmitState({
      status: "success",
      message: isNewFamily
        ? "Waitlist request saved. New students are invited when a regular spot opens."
        : "Registration request saved as pending for teacher approval."
    });
    setForm(initialForm);
  }

  return (
    <>
      <header className="site-header">
        <nav className="nav">
          <a className="brand" href="#top" aria-label="Mia's Music Studio scheduler home">
            <span className="brand-mark">MS</span>
            <span>
              <strong>Mia's Music Studio</strong>
              <small>Lesson enrollment</small>
            </span>
          </a>
          <div className="nav-actions" aria-label="Primary navigation">
            <a href="#register">Register</a>
            <a href="#waitlist">Waitlist</a>
            <a href="#admin">Admin Preview</a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">School year and summer lesson placement</p>
            <h1>Request your recurring lesson time for the season.</h1>
            <p>
              Returning families request their preferred studio time first. New students join
              the waitlist and are invited into a 4-lesson trial only when a regular spot opens.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#register">Start registration</a>
              <a className="button secondary" href="#admin">Review admin flow</a>
            </div>
          </div>
          <div className="hero-panel" aria-label="Schedule snapshot">
            <div className="panel-header">
              <span>2026-2027 School Year</span>
              <strong>Registration: returning families</strong>
            </div>
            <div className="stat-grid">
              <div>
                <strong>{openSlotsCount}</strong>
                <span>open slots</span>
              </div>
              <div>
                <strong>{pendingCount}</strong>
                <span>pending</span>
              </div>
              <div>
                <strong>2</strong>
                <span>locations</span>
              </div>
            </div>
            <ol className="flow-list">
              <li>Parents submit first, second, and third choices.</li>
              <li>Requested times are held until reviewed.</li>
              <li>Approved placements sync to Google Calendar.</li>
            </ol>
          </div>
        </section>

        <section className="section" id="register">
          <div className="section-heading">
            <p className="eyebrow">Parent registration</p>
            <h2>Request a recurring lesson time</h2>
            <p>
              This prototype shows exact available openings by location while preserving the
              flexibility to rearrange requests before the final schedule is approved.
            </p>
          </div>

          <div className="workspace-grid">
            <form className="scheduler-card" onSubmit={submitRequest}>
              <div className="field-row">
                <label>
                  Schedule
                  <select name="term" value={form.term} onChange={updateForm}>
                    <option value="school">School year 2026-2027</option>
                    <option value="summer">Summer lesson block</option>
                  </select>
                </label>
                <label>
                  Family type
                  <select name="familyType" value={form.familyType} onChange={updateForm}>
                    <option value="returning">Returning student</option>
                    <option value="new">New student</option>
                  </select>
                </label>
              </div>

              {!isNewFamily && (
                <label>
                  Returning family access code
                  <input name="accessCode" value={form.accessCode} onChange={updateForm} placeholder="Example: FALL2026" />
                </label>
              )}

              <div className="field-row">
                <label>
                  Parent name
                  <input required name="parentName" value={form.parentName} onChange={updateForm} placeholder="Parent or guardian" />
                </label>
                <label>
                  Email
                  <input required type="email" name="email" value={form.email} onChange={updateForm} placeholder="name@example.com" />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Student name
                  <input required name="studentName" value={form.studentName} onChange={updateForm} placeholder="Student name" />
                </label>
                <label>
                  Lesson length
                  <select name="lessonLength" value={form.lessonLength} onChange={updateForm}>
                    <option value="30">30 minutes - $42</option>
                    <option value="45">45 minutes - $62</option>
                    <option value="60">60 minutes - $82</option>
                  </select>
                </label>
              </div>

              <label>
                Preferred location
                <select name="location" value={form.location} onChange={updateForm}>
                  <option value="Vacaville">Vacaville Studio</option>
                  <option value="Davis">Davis Location</option>
                </select>
              </label>

              <fieldset>
                <legend>Preferred recurring times</legend>
                <div className="choice-grid">
                  {["firstChoice", "secondChoice", "thirdChoice"].map((choice, index) => (
                    <label key={choice}>
                      {index === 0 ? "First choice" : index === 1 ? "Second choice" : "Third choice"}
                      <select name={choice} value={form[choice]} onChange={updateForm} disabled={isNewFamily}>
                        <option value="">{index === 0 ? "Choose first choice" : `Choose choice ${index + 1}`}</option>
                        {openSlots.map((slot) => (
                          <option key={`${choice}-${slotLabel(slot)}`} value={slotLabel(slot)}>
                            {slotLabel(slot)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label>
                Notes
                <textarea
                  name="notes"
                  rows="4"
                  value={form.notes}
                  onChange={updateForm}
                  placeholder="Anything helpful about siblings, schedule constraints, or summer availability"
                />
              </label>

              <div className="form-footer">
                <p>
                  {isNewFamily
                    ? "New families join the waitlist first. Trial lessons are offered only when a regular spot opens."
                    : "Returning family requests are held as pending until teacher approval."}
                </p>
                <button className="button primary" type="submit" disabled={submitState.status === "saving"}>
                  {submitState.status === "saving" ? "Saving..." : "Submit request"}
                </button>
              </div>
              {submitState.message && (
                <p className={`submit-message ${submitState.status}`}>{submitState.message}</p>
              )}
            </form>

            <aside className="availability-card">
              <div className="card-heading">
                <p className="eyebrow">Live preview</p>
                <h3>{form.location} openings</h3>
              </div>
              <div className="slot-list">
                {filteredSlots.length ? (
                  filteredSlots.map((slot) => (
                    <div className={`slot ${slot.status === "held" ? "held" : ""}`} key={slotLabel(slot)}>
                      <strong>{slotLabel(slot)}</strong>
                      <span className="slot-meta">
                        {slot.status === "held" ? "Held pending approval" : "Available to request"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="slot">
                    <strong>No exact matches</strong>
                    <span className="slot-meta">Try a different lesson length or join the waitlist.</span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>

        <section className="section muted" id="waitlist">
          <div className="section-heading">
            <p className="eyebrow">New students</p>
            <h2>Waitlist and 4-lesson trial process</h2>
            <p>
              New students do not see the regular schedule. They join the waitlist first.
              When a student drops, the open weekly time can be offered as a 4-lesson trial.
            </p>
          </div>
          <div className="process-grid">
            {[
              ["Join waitlist", "Families share location, day, time, and lesson-length preferences."],
              ["Spot opens", "You invite one waitlisted family when a weekly time becomes available."],
              ["Trial block", "The family takes that same weekly time for 4 lessons."],
              ["Continue or release", "You decide whether the student keeps the time or the slot reopens."]
            ].map(([title, text], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="admin">
          <div className="section-heading">
            <p className="eyebrow">Admin dashboard</p>
            <h2>Review requests before the schedule is final</h2>
            <p>
              Sign in to view real registration and waitlist requests saved in Supabase.
            </p>
          </div>
          <div className="admin-layout">
            <div className="admin-panel">
              {!adminSession ? (
                <form className="admin-login" onSubmit={signInAdmin}>
                  <label>
                    Admin email
                    <input required type="email" name="email" value={adminLogin.email} onChange={updateAdminLogin} placeholder="you@example.com" />
                  </label>
                  <label>
                    Password
                    <input required type="password" name="password" value={adminLogin.password} onChange={updateAdminLogin} placeholder="Supabase password" />
                  </label>
                  <button className="button primary" type="submit" disabled={adminLoading}>
                    {adminLoading ? "Signing in..." : "Sign in"}
                  </button>
                  {adminMessage && <p className="admin-message">{adminMessage}</p>}
                </form>
              ) : (
                <>
                  <div className="admin-session-bar">
                    <span>Signed in as {adminSession.user.email}</span>
                    <div>
                      <button className="button secondary" type="button" onClick={loadAdminData} disabled={adminLoading}>Refresh</button>
                      <button className="button secondary" type="button" onClick={signOutAdmin}>Sign out</button>
                    </div>
                  </div>
                  <div className="admin-toolbar">
                    {["pending", "approved", "trial", "waitlist"].map((status) => (
                      <button
                        className={`tab-button ${adminFilter === status ? "active" : ""}`}
                        key={status}
                        onClick={() => setAdminFilter(status)}
                        type="button"
                      >
                        {status === "trial" ? "Trials" : status[0].toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                  </div>
                  {adminMessage && <p className="admin-message">{adminMessage}</p>}
                  <div className="admin-list">
                    {adminCards.length ? (
                      adminCards.map((item) => (
                        <article className="admin-card" key={`${item.table}-${item.id}`}>
                          <span className={`status-pill status-${item.status}`}>{item.status}</span>
                          <h3>{item.name}</h3>
                          <p>{item.details}</p>
                          <p>{item.choices}</p>
                          {item.parentName && <p>Parent: {item.parentName}</p>}
                          <p>Email: {item.email}</p>
                          {item.notes && <p>Notes: {item.notes}</p>}
                          <div className="admin-card-actions">
                            {item.table === "registration_requests" && item.status === "pending" && (
                              <>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "approved")}>Approve</button>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "rejected")}>Reject</button>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "waitlist")}>Waitlist</button>
                              </>
                            )}
                            {item.table === "waitlist_entries" && (
                              <>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "invited")}>Invite</button>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "trial")}>Start trial</button>
                                <button className="button secondary" type="button" onClick={() => updateRequestStatus(item, "closed")}>Close</button>
                              </>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        <strong>No {adminFilter} requests yet.</strong>
                        <span>New submissions will appear here after parents use the registration form.</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <aside className="rules-card">
              <h3>Schedule rules</h3>
              <dl>
                <div>
                  <dt>Vacaville</dt>
                  <dd>Monday, Wednesday, Friday - 3:00 PM to 8:00 PM</dd>
                </div>
                <div>
                  <dt>Davis</dt>
                  <dd>Tuesday 3:00 PM to 8:45 PM, Thursday 2:45 PM to 8:00 PM, Saturday 9:00 AM to 2:45 PM</dd>
                </div>
                <div>
                  <dt>Approval</dt>
                  <dd>Every request stays pending until reviewed.</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>Prototype for yearly and summer music lesson placement.</p>
      </footer>
    </>
  );
}
