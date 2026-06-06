"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const defaultScheduleRules = [
  { id: "default-school-vacaville-monday", term: "school", location: "Vacaville", day_of_week: "Monday", start_time: "15:00", end_time: "20:00", active: true },
  { id: "default-school-vacaville-wednesday", term: "school", location: "Vacaville", day_of_week: "Wednesday", start_time: "15:00", end_time: "20:00", active: true },
  { id: "default-school-vacaville-friday", term: "school", location: "Vacaville", day_of_week: "Friday", start_time: "15:00", end_time: "20:00", active: true },
  { id: "default-school-davis-tuesday", term: "school", location: "Davis", day_of_week: "Tuesday", start_time: "15:00", end_time: "20:45", active: true },
  { id: "default-school-davis-thursday", term: "school", location: "Davis", day_of_week: "Thursday", start_time: "14:45", end_time: "20:00", active: true },
  { id: "default-school-davis-saturday", term: "school", location: "Davis", day_of_week: "Saturday", start_time: "09:00", end_time: "14:45", active: true },
  { id: "default-summer-vacaville-monday", term: "summer", location: "Vacaville", day_of_week: "Monday", start_time: "10:00", end_time: "13:00", active: true },
  { id: "default-summer-davis-tuesday", term: "summer", location: "Davis", day_of_week: "Tuesday", start_time: "09:30", end_time: "12:30", active: true }
];

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

const initialScheduleRule = {
  term: "school",
  location: "Vacaville",
  day_of_week: "Monday",
  start_time: "15:00",
  end_time: "20:00"
};

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function slotLabel(slot) {
  return `${slot.day} at ${slot.start} (${slot.length} minutes)`;
}

function generateSlots(rules, term, location, lessonLength) {
  return rules
    .filter((rule) => rule.active !== false && rule.term === term && (!location || rule.location === location))
    .flatMap((rule) => {
      const start = minutesFromTime(rule.start_time);
      const end = minutesFromTime(rule.end_time);
      const slots = [];

      for (let current = start; current + lessonLength <= end; current += lessonLength) {
        slots.push({
          day: rule.day_of_week,
          start: formatTime(current),
          length: lessonLength,
          location: rule.location,
          status: "open"
        });
      }

      return slots;
    });
}

function sortRules(rules) {
  return [...rules].sort((a, b) => {
    const termCompare = a.term.localeCompare(b.term);
    if (termCompare) return termCompare;
    const locationCompare = a.location.localeCompare(b.location);
    if (locationCompare) return locationCompare;
    const dayCompare = weekdays.indexOf(a.day_of_week) - weekdays.indexOf(b.day_of_week);
    if (dayCompare) return dayCompare;
    return a.start_time.localeCompare(b.start_time);
  });
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
  const [scheduleRules, setScheduleRules] = useState(defaultScheduleRules);
  const [scheduleRuleForm, setScheduleRuleForm] = useState(initialScheduleRule);
  const [scheduleMessage, setScheduleMessage] = useState("");

  const filteredSlots = useMemo(() => {
    return generateSlots(scheduleRules, form.term, form.location, Number(form.lessonLength));
  }, [scheduleRules, form.term, form.location, form.lessonLength]);

  const openSlots = filteredSlots.filter((slot) => slot.status === "open");
  const allSlots = generateSlots(scheduleRules, form.term, null, Number(form.lessonLength));
  const openSlotsCount = allSlots.filter((slot) => slot.status === "open").length;
  const pendingCount = registrationRequests.filter((request) => request.status === "pending").length;
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

    loadScheduleRules();

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

  function updateScheduleRuleForm(event) {
    const { name, value } = event.target;
    setScheduleRuleForm((current) => ({ ...current, [name]: value }));
  }

  async function loadScheduleRules() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("schedule_rules")
      .select("id, term, location, day_of_week, start_time, end_time, active")
      .eq("active", true)
      .order("term")
      .order("location")
      .order("day_of_week");

    if (error) {
      setScheduleMessage(`Using default schedule until Supabase schedule rules are available: ${error.message}`);
      setScheduleRules(defaultScheduleRules);
      return;
    }

    setScheduleRules(data?.length ? data : defaultScheduleRules);
    setScheduleMessage(data?.length ? "Schedule loaded." : "Using default schedule. Add rules below to customize it.");
  }

  async function addScheduleRule(event) {
    event.preventDefault();
    setAdminLoading(true);
    setScheduleMessage("Adding schedule rule...");

    if (!supabase) {
      setScheduleMessage("Supabase is not configured yet.");
      setAdminLoading(false);
      return;
    }

    if (minutesFromTime(scheduleRuleForm.start_time) >= minutesFromTime(scheduleRuleForm.end_time)) {
      setScheduleMessage("Start time must be before end time.");
      setAdminLoading(false);
      return;
    }

    const { error } = await supabase.from("schedule_rules").insert({
      ...scheduleRuleForm,
      active: true
    });

    if (error) {
      setScheduleMessage(`Could not add schedule rule: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    setScheduleRuleForm(initialScheduleRule);
    await loadScheduleRules();
    setScheduleMessage("Schedule rule added.");
    setAdminLoading(false);
  }

  async function deleteScheduleRule(ruleId) {
    setAdminLoading(true);
    setScheduleMessage("Removing schedule rule...");

    if (!supabase) {
      setScheduleMessage("Supabase is not configured yet.");
      setAdminLoading(false);
      return;
    }

    const { error } = await supabase
      .from("schedule_rules")
      .update({ active: false })
      .eq("id", ruleId);

    if (error) {
      setScheduleMessage(`Could not remove schedule rule: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    await loadScheduleRules();
    setScheduleMessage("Schedule rule removed.");
    setAdminLoading(false);
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
    await loadScheduleRules();
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
                <span>open starts</span>
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
              <li>Parents submit first, second, and third start-time choices.</li>
              <li>Start-time options adjust to the selected lesson length.</li>
              <li>Approved placements sync to Google Calendar.</li>
            </ol>
          </div>
        </section>

        <section className="section" id="register">
          <div className="section-heading">
            <p className="eyebrow">Parent registration</p>
            <h2>Request a recurring lesson time</h2>
            <p>
              This form shows start-time options by location while preserving the
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
                <h3>{form.location} {form.lessonLength}-minute starts</h3>
              </div>
              <div className="slot-list">
                {filteredSlots.length ? (
                  filteredSlots.map((slot) => (
                    <div className={`slot ${slot.status === "held" ? "held" : ""}`} key={slotLabel(slot)}>
                      <strong>{slotLabel(slot)}</strong>
                      <span className="slot-meta">
                        Available to request
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="slot">
                    <strong>No start times available</strong>
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
                  <div className="schedule-builder">
                    <div className="section-heading compact-heading">
                      <p className="eyebrow">Schedule builder</p>
                      <h3>Add teaching block</h3>
                      <p>Create recurring weekly teaching blocks. Parent start times are generated from the block and selected lesson length.</p>
                    </div>
                    <form className="schedule-rule-form" onSubmit={addScheduleRule}>
                      <label>
                        Schedule
                        <select name="term" value={scheduleRuleForm.term} onChange={updateScheduleRuleForm}>
                          <option value="school">School year</option>
                          <option value="summer">Summer</option>
                        </select>
                      </label>
                      <label>
                        Location
                        <select name="location" value={scheduleRuleForm.location} onChange={updateScheduleRuleForm}>
                          <option value="Vacaville">Vacaville</option>
                          <option value="Davis">Davis</option>
                        </select>
                      </label>
                      <label>
                        Day
                        <select name="day_of_week" value={scheduleRuleForm.day_of_week} onChange={updateScheduleRuleForm}>
                          {weekdays.map((day) => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Start
                        <input type="time" name="start_time" value={scheduleRuleForm.start_time} onChange={updateScheduleRuleForm} />
                      </label>
                      <label>
                        End
                        <input type="time" name="end_time" value={scheduleRuleForm.end_time} onChange={updateScheduleRuleForm} />
                      </label>
                      <button className="button primary" type="submit" disabled={adminLoading}>Add rule</button>
                    </form>
                    {scheduleMessage && <p className="admin-message">{scheduleMessage}</p>}
                  </div>
                </>
              )}
            </div>
            <aside className="rules-card">
              <h3>Teaching blocks</h3>
              <div className="rules-list">
                {sortRules(scheduleRules).map((rule) => (
                  <article className="rule-item" key={rule.id}>
                    <div>
                        <strong>{rule.location}</strong>
                        <span>{rule.term === "school" ? "School year" : "Summer"} · {rule.day_of_week}</span>
                        <small>{formatTime(minutesFromTime(rule.start_time))} to {formatTime(minutesFromTime(rule.end_time))}</small>
                    </div>
                    {adminSession && !String(rule.id).startsWith("default-") && (
                      <button className="text-button" type="button" onClick={() => deleteScheduleRule(rule.id)}>Remove</button>
                    )}
                  </article>
                ))}
              </div>
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
