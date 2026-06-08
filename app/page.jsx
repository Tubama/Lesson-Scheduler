"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const fallbackReturningAccessCode = process.env.NEXT_PUBLIC_RETURNING_ACCESS_CODE || "FALL2026";

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
const slotStartIntervalMinutes = 15;

const initialForm = {
  term: "school",
  familyType: "returning",
  accessCode: "",
  parentName: "",
  email: "",
  studentName: "",
  studentBirthdate: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  lessonLength: "30",
  location: "Vacaville",
  firstChoice: "",
  secondChoice: "",
  thirdChoice: "",
  policyAcknowledged: false,
  signedName: "",
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

const initialAdminSettings = {
  returningAccessCode: fallbackReturningAccessCode,
  registrationOpen: true
};

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesFromDisplayTime(time) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3].toUpperCase();

  if (suffix === "PM" && hours !== 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;

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

function parseSlotLabel(label) {
  const match = label.match(/^(.+) at (.+) \((\d+) minutes\)$/);
  if (!match) return null;

  const startMinutes = minutesFromDisplayTime(match[2]);
  const length = Number(match[3]);
  if (startMinutes === null) return null;

  return {
    day: match[1],
    startMinutes,
    endMinutes: startMinutes + length,
    length
  };
}

function normalizeAccessCode(code) {
  return code.trim().toUpperCase();
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function formatDateTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvValue).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function mailtoForItem(item) {
  const studentName = item.name || "your student";
  const choices = item.choices && item.choices !== "No choices selected." ? `\n\nRequested time details:\n${item.choices}` : "";
  const greeting = item.parentName ? `Hi ${item.parentName},` : "Hi,";
  const subjectByStatus = {
    pending: `Mia's Music Studio registration request for ${studentName}`,
    approved: `Mia's Music Studio lesson time approved for ${studentName}`,
    rejected: `Mia's Music Studio registration update for ${studentName}`,
    waitlist: `Mia's Music Studio waitlist update for ${studentName}`,
    waiting: `Mia's Music Studio waitlist request for ${studentName}`,
    invited: `Mia's Music Studio trial lesson invitation for ${studentName}`,
    trial: `Mia's Music Studio trial lessons for ${studentName}`,
    closed: `Mia's Music Studio waitlist update for ${studentName}`
  };
  const bodyByStatus = {
    pending: `${greeting}\n\nThank you for submitting a lesson registration request for ${studentName}. I received your request and will review the schedule before confirming final placements.${choices}\n\nThank you,\nMia's Music Studio`,
    approved: `${greeting}\n\n${studentName}'s recurring lesson time has been approved.${choices}\n\nThank you,\nMia's Music Studio`,
    waitlist: `${greeting}\n\nThank you for your registration request for ${studentName}. At this time I am moving the request to the waitlist and will follow up if a suitable spot opens.${choices}\n\nThank you,\nMia's Music Studio`,
    invited: `${greeting}\n\nA lesson time may be available for ${studentName}, and I would like to invite you to begin the 4-lesson trial process.\n\nPlease reply to confirm whether you would like to move forward.\n\nThank you,\nMia's Music Studio`,
    trial: `${greeting}\n\nThis is a note about ${studentName}'s 4-lesson trial block. Please reply if you have any questions.\n\nThank you,\nMia's Music Studio`
  };
  const subject = subjectByStatus[item.status] || `Mia's Music Studio update for ${studentName}`;
  const body = bodyByStatus[item.status] || `${greeting}\n\nI am following up about ${studentName}'s lesson registration.${choices}\n\nThank you,\nMia's Music Studio`;

  return `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function overlaps(slot, hold) {
  return (
    hold.active &&
    ["pending", "approved"].includes(hold.status) &&
    slot.term === hold.term &&
    slot.location === hold.location &&
    slot.day === hold.day_of_week &&
    slot.startMinutes < hold.end_minutes &&
    slot.endMinutes > hold.start_minutes
  );
}

function generateSlots(rules, holds, term, location, lessonLength) {
  return rules
    .filter((rule) => rule.active !== false && rule.term === term && (!location || rule.location === location))
    .flatMap((rule) => {
      const start = minutesFromTime(rule.start_time);
      const end = minutesFromTime(rule.end_time);
      const slots = [];

      for (let current = start; current + lessonLength <= end; current += slotStartIntervalMinutes) {
        slots.push({
          term,
          day: rule.day_of_week,
          start: formatTime(current),
          startMinutes: current,
          endMinutes: current + lessonLength,
          length: lessonLength,
          location: rule.location,
          status: holds.some((hold) => overlaps({
            term,
            day: rule.day_of_week,
            startMinutes: current,
            endMinutes: current + lessonLength,
            location: rule.location
          }, hold))
            ? "held"
            : "open"
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
  const [selectedDay, setSelectedDay] = useState("");
  const [adminFilter, setAdminFilter] = useState("pending");
  const [submitState, setSubmitState] = useState({ status: "idle", message: "" });
  const [adminLogin, setAdminLogin] = useState(initialAdminLogin);
  const [adminSession, setAdminSession] = useState(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [waitlistEntries, setWaitlistEntries] = useState([]);
  const [scheduleRules, setScheduleRules] = useState(defaultScheduleRules);
  const [scheduleHolds, setScheduleHolds] = useState([]);
  const [scheduleRuleForm, setScheduleRuleForm] = useState(initialScheduleRule);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [moveSelections, setMoveSelections] = useState({});
  const [adminSettings, setAdminSettings] = useState(initialAdminSettings);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [adminSearch, setAdminSearch] = useState("");
  const [movePickerDays, setMovePickerDays] = useState({});

  const filteredSlots = useMemo(() => {
    return generateSlots(scheduleRules, scheduleHolds, form.term, form.location, Number(form.lessonLength));
  }, [scheduleRules, scheduleHolds, form.term, form.location, form.lessonLength]);

  const openSlots = filteredSlots.filter((slot) => slot.status === "open");
  const slotsByDay = useMemo(() => {
    return weekdays
      .map((day) => ({
        day,
        slots: filteredSlots.filter((slot) => slot.day === day),
        openCount: filteredSlots.filter((slot) => slot.day === day && slot.status === "open").length
      }))
      .filter((group) => group.slots.length > 0);
  }, [filteredSlots]);
  const selectedDaySlots = selectedDay
    ? filteredSlots.filter((slot) => slot.day === selectedDay)
    : slotsByDay[0]?.slots || [];
  const allSlots = generateSlots(scheduleRules, scheduleHolds, form.term, null, Number(form.lessonLength));
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
            term: item.term,
            status: item.status,
            name: item.student_name,
            details: `${item.parent_name} was moved from registration requests to the waitlist.`,
            choices: [item.first_choice, item.second_choice, item.third_choice].filter(Boolean).join(" | ") || "No choices selected.",
            firstChoice: item.first_choice,
            email: item.email,
            parentName: item.parent_name,
            lessonLength: item.lesson_length,
            location: item.location,
            studentBirthdate: item.student_birthdate,
            emergencyContact: item.emergency_contact_name,
            emergencyPhone: item.emergency_contact_phone,
            signedName: item.signed_name,
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
          parentName: item.parent_name,
          lessonLength: item.lesson_length,
          location: item.location,
          studentBirthdate: item.student_birthdate,
          emergencyContact: item.emergency_contact_name,
          emergencyPhone: item.emergency_contact_phone,
          notes: item.notes,
          signedName: item.signed_name,
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
          parentName: item.parent_name,
          lessonLength: item.lesson_length,
          location: item.location,
          studentBirthdate: item.student_birthdate,
          emergencyContact: item.emergency_contact_name,
          emergencyPhone: item.emergency_contact_phone,
          notes: item.notes,
          signedName: item.signed_name,
          createdAt: item.created_at
        }));
    }

    return registrationRequests
      .filter((item) => item.status === adminFilter)
      .map((item) => ({
        id: item.id,
        table: "registration_requests",
        term: item.term,
        status: item.status,
        name: item.student_name,
        details: `${item.family_type === "returning" ? "Returning" : "New"} student requesting ${item.location}, ${item.lesson_length} minutes.`,
        choices: [item.first_choice, item.second_choice, item.third_choice].filter(Boolean).join(" | ") || "No choices selected.",
        firstChoice: item.first_choice,
        email: item.email,
        parentName: item.parent_name,
        lessonLength: item.lesson_length,
        location: item.location,
        studentBirthdate: item.student_birthdate,
        emergencyContact: item.emergency_contact_name,
        emergencyPhone: item.emergency_contact_phone,
        signedName: item.signed_name,
        notes: item.notes,
        createdAt: item.created_at
      }));
  }, [adminFilter, registrationRequests, waitlistEntries]);

  const visibleAdminCards = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return adminCards;

    return adminCards.filter((item) => [
      item.name,
      item.parentName,
      item.email,
      item.location,
      item.status,
      item.details,
      item.choices,
      item.notes,
      item.emergencyContact,
      item.emergencyPhone
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [adminCards, adminSearch]);

  const adminCounts = useMemo(() => ({
    pending: registrationRequests.filter((item) => item.status === "pending").length,
    approved: registrationRequests.filter((item) => item.status === "approved").length,
    trial: waitlistEntries.filter((item) => item.status === "trial").length,
    waitlist: registrationRequests.filter((item) => item.status === "waitlist").length + waitlistEntries.length
  }), [registrationRequests, waitlistEntries]);

  const approvedScheduleRows = useMemo(() => {
    return registrationRequests
      .filter((request) => request.status === "approved" && request.first_choice)
      .map((request) => {
        const parsedChoice = parseSlotLabel(request.first_choice);
        if (!parsedChoice) return null;

        return {
          id: request.id,
          table: "registration_requests",
          status: request.status,
          term: request.term,
          location: request.location,
          day: parsedChoice.day,
          startMinutes: parsedChoice.startMinutes,
          time: formatTime(parsedChoice.startMinutes),
          name: request.student_name,
          studentName: request.student_name,
          parentName: request.parent_name,
          email: request.email,
          lessonLength: request.lesson_length,
          firstChoice: request.first_choice,
          secondChoice: request.second_choice,
          thirdChoice: request.third_choice,
          notes: request.notes
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const termCompare = a.term.localeCompare(b.term);
        if (termCompare) return termCompare;
        const locationCompare = a.location.localeCompare(b.location);
        if (locationCompare) return locationCompare;
        const dayCompare = weekdays.indexOf(a.day) - weekdays.indexOf(b.day);
        if (dayCompare) return dayCompare;
        return a.startMinutes - b.startMinutes;
      });
  }, [registrationRequests]);

  const approvedScheduleGroups = useMemo(() => {
    return approvedScheduleRows.reduce((groups, row) => {
      const title = `${row.term === "summer" ? "Summer" : "School year"} · ${row.location} · ${row.day}`;
      const existingGroup = groups.find((group) => group.title === title);

      if (existingGroup) {
        existingGroup.rows.push(row);
        return groups;
      }

      return [...groups, { title, rows: [row] }];
    }, []);
  }, [approvedScheduleRows]);

  const scheduleActivityRows = useMemo(() => {
    const registrationRows = registrationRequests
      .filter((request) => ["approved", "pending", "waitlist"].includes(request.status))
      .map((request) => {
        const parsedChoice = parseSlotLabel(request.first_choice || "");

        return {
          id: `registration-${request.id}`,
          status: request.status,
          placement: parsedChoice ? "scheduled" : "unscheduled",
          term: request.term || "school",
          location: request.location || "No location",
          day: parsedChoice?.day || "Unscheduled",
          startMinutes: parsedChoice?.startMinutes ?? 99999,
          time: parsedChoice ? formatTime(parsedChoice.startMinutes) : "No time selected",
          studentName: request.student_name,
          parentName: request.parent_name,
          email: request.email,
          lessonLength: request.lesson_length,
          notes: request.notes,
          sortStatus: request.status
        };
      });

    const waitlistRows = waitlistEntries
      .filter((entry) => ["waiting", "invited", "trial"].includes(entry.status))
      .map((entry) => ({
        id: `waitlist-${entry.id}`,
        status: entry.status === "waiting" ? "waitlist" : entry.status,
        placement: "unscheduled",
        term: "waitlist",
        location: entry.location || "No location",
        day: "Waitlist / trials",
        startMinutes: 99999,
        time: entry.status === "trial" ? "Trial candidate" : "Waiting",
        studentName: entry.student_name,
        parentName: entry.parent_name,
        email: entry.email,
        lessonLength: entry.lesson_length,
        notes: entry.notes,
        sortStatus: entry.status
      }));

    return [...registrationRows, ...waitlistRows].sort((a, b) => {
      if (a.placement !== b.placement) return a.placement === "scheduled" ? -1 : 1;
      const termCompare = a.term.localeCompare(b.term);
      if (termCompare) return termCompare;
      const locationCompare = a.location.localeCompare(b.location);
      if (locationCompare) return locationCompare;
      const dayCompare = (weekdays.indexOf(a.day) === -1 ? 99 : weekdays.indexOf(a.day)) - (weekdays.indexOf(b.day) === -1 ? 99 : weekdays.indexOf(b.day));
      if (dayCompare) return dayCompare;
      const timeCompare = a.startMinutes - b.startMinutes;
      if (timeCompare) return timeCompare;
      const statusCompare = a.sortStatus.localeCompare(b.sortStatus);
      if (statusCompare) return statusCompare;
      return a.studentName.localeCompare(b.studentName);
    });
  }, [registrationRequests, waitlistEntries]);

  const scheduleActivityGroups = useMemo(() => {
    return scheduleActivityRows.reduce((groups, row) => {
      const title = row.placement === "scheduled"
        ? `${row.term === "summer" ? "Summer" : "School year"} · ${row.location} · ${row.day}`
        : `${row.status === "trial" ? "Trials" : "Waitlist"} · ${row.location}`;
      const existingGroup = groups.find((group) => group.title === title);

      if (existingGroup) {
        existingGroup.rows.push(row);
        return groups;
      }

      return [...groups, { title, rows: [row] }];
    }, []);
  }, [scheduleActivityRows]);

  const scheduleConflictGroups = useMemo(() => {
    const pendingRows = registrationRequests
      .filter((request) => request.status === "pending" && request.first_choice)
      .map((request) => {
        const parsedChoice = parseSlotLabel(request.first_choice);
        if (!parsedChoice) return null;

        return {
          id: request.id,
          term: request.term,
          location: request.location,
          day: parsedChoice.day,
          startMinutes: parsedChoice.startMinutes,
          endMinutes: parsedChoice.endMinutes,
          timeRange: `${formatTime(parsedChoice.startMinutes)}-${formatTime(parsedChoice.endMinutes)}`,
          studentName: request.student_name,
          status: request.status
        };
      })
      .filter(Boolean);
    const approvedRows = approvedScheduleRows.map((row) => ({
      ...row,
      endMinutes: row.startMinutes + Number(row.lessonLength || 0),
      timeRange: `${formatTime(row.startMinutes)}-${formatTime(row.startMinutes + Number(row.lessonLength || 0))}`
    }));
    const scheduledRows = [...approvedRows, ...pendingRows]
      .sort((a, b) => {
        const termCompare = a.term.localeCompare(b.term);
        if (termCompare) return termCompare;
        const locationCompare = a.location.localeCompare(b.location);
        if (locationCompare) return locationCompare;
        const dayCompare = weekdays.indexOf(a.day) - weekdays.indexOf(b.day);
        if (dayCompare) return dayCompare;
        return a.startMinutes - b.startMinutes;
      });

    const conflictMap = new Map();

    scheduledRows.forEach((row, index) => {
      scheduledRows.slice(index + 1).forEach((otherRow) => {
        const sameBlock = row.term === otherRow.term && row.location === otherRow.location && row.day === otherRow.day;
        const overlapsTime = row.startMinutes < otherRow.endMinutes && otherRow.startMinutes < row.endMinutes;
        if (!sameBlock || !overlapsTime) return;

        const title = `${row.term === "summer" ? "Summer" : "School year"} · ${row.location} · ${row.day}`;
        const conflict = `${row.studentName} (${row.timeRange}, ${row.status}) overlaps ${otherRow.studentName} (${otherRow.timeRange}, ${otherRow.status})`;
        conflictMap.set(title, [...(conflictMap.get(title) || []), conflict]);
      });
    });

    return Array.from(conflictMap, ([title, conflicts]) => ({ title, conflicts }));
  }, [approvedScheduleRows, registrationRequests]);

  const scheduleHealthIssues = useMemo(() => {
    return registrationRequests
      .filter((request) => ["pending", "approved"].includes(request.status))
      .map((request) => {
        const parsedChoice = parseSlotLabel(request.first_choice || "");
        if (!parsedChoice) {
          return `${request.student_name} is ${request.status} but does not have a valid first-choice time.`;
        }

        const matchingHold = scheduleHolds.find((hold) => (
          hold.request_id === request.id &&
          hold.active &&
          hold.term === request.term &&
          hold.location === request.location &&
          hold.day_of_week === parsedChoice.day &&
          hold.start_minutes === parsedChoice.startMinutes &&
          hold.end_minutes === parsedChoice.endMinutes
        ));

        if (matchingHold) return null;

        return `${request.student_name} is ${request.status} for ${request.location} ${parsedChoice.day} at ${formatTime(parsedChoice.startMinutes)}, but that time is not currently protected by an active schedule hold. Use Change time/Move or re-approve after choosing the correct time.`;
      })
      .filter(Boolean);
  }, [registrationRequests, scheduleHolds]);

  useEffect(() => {
    if (!supabase) return;

    loadScheduleRules();
    loadScheduleHolds();
    loadRegistrationStatus();

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

  useEffect(() => {
    if (!slotsByDay.length) {
      setSelectedDay("");
      return;
    }

    if (!slotsByDay.some((group) => group.day === selectedDay)) {
      setSelectedDay(slotsByDay[0].day);
    }
  }, [slotsByDay, selectedDay]);

  function updateForm(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: type === "checkbox" ? checked : value };
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

  function updateAdminSettings(event) {
    const { checked, name, type, value } = event.target;
    setAdminSettings((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function selectPreferredTime(label) {
    setForm((current) => {
      const choiceFields = ["firstChoice", "secondChoice", "thirdChoice"];
      const existingField = choiceFields.find((field) => current[field] === label);

      if (existingField) {
        return { ...current, [existingField]: "" };
      }

      const emptyField = choiceFields.find((field) => !current[field]);
      return { ...current, [emptyField || "thirdChoice"]: label };
    });
  }

  function moveOptionsFor(item) {
    if (item.table !== "registration_requests" || !item.term || !item.location || !item.lessonLength) {
      return [];
    }

    const holdsWithoutCurrentRequest = scheduleHolds.filter((hold) => hold.request_id !== item.id);
    return generateSlots(scheduleRules, holdsWithoutCurrentRequest, item.term, item.location, Number(item.lessonLength))
      .filter((slot) => slot.status === "open");
  }

  function moveOptionGroupsFor(item) {
    const options = moveOptionsFor(item);
    return weekdays
      .map((day) => ({
        day,
        slots: options.filter((slot) => slot.day === day)
      }))
      .filter((group) => group.slots.length > 0);
  }

  function selectMovePickerDay(itemId, day) {
    setMovePickerDays((current) => ({ ...current, [itemId]: day }));
    setMoveSelections((current) => {
      const currentChoice = current[itemId];
      const parsedChoice = currentChoice ? parseSlotLabel(currentChoice) : null;
      if (!parsedChoice || parsedChoice.day === day) return current;
      return { ...current, [itemId]: "" };
    });
  }

  function selectMovePickerTime(itemId, label) {
    const parsedChoice = parseSlotLabel(label);
    if (parsedChoice) {
      setMovePickerDays((current) => ({ ...current, [itemId]: parsedChoice.day }));
    }
    setMoveSelections((current) => ({ ...current, [itemId]: label }));
  }

  function renderMovePicker(item, compact = false) {
    const groups = moveOptionGroupsFor(item);
    const selectedChoice = moveSelections[item.id] || "";
    const selectedParsed = selectedChoice ? parseSlotLabel(selectedChoice) : null;
    const activeDay = movePickerDays[item.id] || selectedParsed?.day || groups[0]?.day || "";
    const activeGroup = groups.find((group) => group.day === activeDay) || groups[0];

    return (
      <div className={`move-picker ${compact ? "compact" : ""}`}>
        {groups.length ? (
          <>
            <div className="move-day-list" aria-label={`Move ${item.name || item.studentName} day`}>
              {groups.map((group) => (
                <button
                  className={`move-day-button ${activeGroup?.day === group.day ? "active" : ""}`}
                  key={`${item.id}-${group.day}`}
                  onClick={() => selectMovePickerDay(item.id, group.day)}
                  type="button"
                >
                  <span>{group.day}</span>
                  <small>{group.slots.length} open</small>
                </button>
              ))}
            </div>
            <div className="move-time-panel">
              <div className="move-time-heading">
                <strong>{activeGroup?.day || "Available times"}</strong>
                <span>{selectedChoice || "Choose a time"}</span>
              </div>
              <div className="move-time-grid" aria-label={`Available ${activeGroup?.day || ""} move times`}>
                {activeGroup?.slots.map((slot) => {
                  const label = slotLabel(slot);
                  return (
                    <button
                      className={`move-time-button ${selectedChoice === label ? "selected" : ""}`}
                      key={`${item.id}-${label}`}
                      onClick={() => selectMovePickerTime(item.id, label)}
                      type="button"
                    >
                      {slot.start}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state compact-empty">
            <strong>No open move times.</strong>
            <span>Change this student's lesson length or teaching blocks if more openings should appear.</span>
          </div>
        )}
        <button className="button secondary" disabled={!selectedChoice} type="button" onClick={() => moveRequestTime(item)}>
          Move
        </button>
      </div>
    );
  }

  async function moveRequestTime(item) {
    if (!supabase) return;

    const nextChoice = moveSelections[item.id];
    const parsedChoice = nextChoice ? parseSlotLabel(nextChoice) : null;

    if (!parsedChoice) {
      setAdminMessage("Choose a new generated time before moving this student.");
      return;
    }

    setAdminLoading(true);
    setAdminMessage("Moving lesson time...");

    const holdActive = ["pending", "approved"].includes(item.status);
    const holdPayload = {
      request_id: item.id,
      term: item.term,
      location: item.location,
      day_of_week: parsedChoice.day,
      start_minutes: parsedChoice.startMinutes,
      end_minutes: parsedChoice.endMinutes,
      status: item.status,
      active: holdActive
    };

    const { data: existingHolds, error: existingHoldError } = await supabase
      .from("schedule_holds")
      .select("id")
      .eq("request_id", item.id)
      .eq("active", true)
      .limit(1);

    if (existingHoldError) {
      setAdminMessage(`The existing schedule hold could not be checked: ${existingHoldError.message}`);
      setAdminLoading(false);
      return;
    }

    const saveResult = existingHolds?.length
      ? await supabase
        .from("schedule_holds")
        .update(holdPayload)
        .eq("id", existingHolds[0].id)
        .select("id")
        .maybeSingle()
      : await supabase
        .from("schedule_holds")
        .insert(holdPayload)
        .select("id")
        .maybeSingle();

    if (saveResult.error || !saveResult.data) {
      const rawMessage = saveResult.error?.message || "";
      const needsPolicyUpdate = rawMessage.toLowerCase().includes("row-level security");

      setAdminMessage(needsPolicyUpdate
        ? "Supabase needs the latest schedule-hold SQL before approved times can be moved. Run the SQL I provided, then try moving again."
        : `That time cannot be used because it overlaps another active hold. Choose a different time. ${rawMessage}`.trim()
      );
      setAdminLoading(false);
      return;
    }

    const { error: cleanupHoldError } = await supabase
      .from("schedule_holds")
      .update({ active: false, status: "moved" })
      .eq("request_id", item.id)
      .neq("id", saveResult.data.id);

    if (cleanupHoldError) {
      setAdminMessage(`Lesson time moved, but older duplicate holds could not be cleaned up: ${cleanupHoldError.message}`);
      setAdminLoading(false);
      return;
    }

    const { error: requestError } = await supabase
      .from("registration_requests")
      .update({ first_choice: nextChoice })
      .eq("id", item.id);

    if (requestError) {
      setAdminMessage(`The hold moved, but the request time could not be updated: ${requestError.message}`);
      setAdminLoading(false);
      return;
    }

    setMoveSelections((current) => ({ ...current, [item.id]: "" }));
    await loadAdminData();
    setAdminMessage("Lesson time moved.");
  }

  async function ensureRequestScheduleHold(item, nextStatus) {
    if (!["pending", "approved"].includes(nextStatus)) {
      return { ok: true };
    }

    const parsedChoice = parseSlotLabel(item.firstChoice || "");
    if (!parsedChoice) {
      return {
        ok: false,
        message: "This request cannot be approved until it has a valid first-choice lesson time."
      };
    }

    const holdPayload = {
      request_id: item.id,
      term: item.term,
      location: item.location,
      day_of_week: parsedChoice.day,
      start_minutes: parsedChoice.startMinutes,
      end_minutes: parsedChoice.endMinutes,
      status: nextStatus,
      active: true
    };

    const { data: existingHolds, error: existingHoldError } = await supabase
      .from("schedule_holds")
      .select("id")
      .eq("request_id", item.id)
      .eq("active", true)
      .limit(1);

    if (existingHoldError) {
      return {
        ok: false,
        message: `The existing schedule hold could not be checked: ${existingHoldError.message}`
      };
    }

    const saveResult = existingHolds?.length
      ? await supabase
        .from("schedule_holds")
        .update(holdPayload)
        .eq("id", existingHolds[0].id)
        .select("id")
        .maybeSingle()
      : await supabase
        .from("schedule_holds")
        .insert(holdPayload)
        .select("id")
        .maybeSingle();

    if (saveResult.error || !saveResult.data) {
      const rawMessage = saveResult.error?.message || "";
      const needsPolicyUpdate = rawMessage.toLowerCase().includes("row-level security");

      return {
        ok: false,
        message: needsPolicyUpdate
          ? "Supabase needs the latest schedule-hold SQL before approval can repair missing holds. Run the SQL I provide, then try approving again."
          : `That time cannot be approved because it overlaps another active hold. Choose a different time first. ${rawMessage}`.trim()
      };
    }

    const { error: cleanupHoldError } = await supabase
      .from("schedule_holds")
      .update({ active: false, status: "moved" })
      .eq("request_id", item.id)
      .neq("id", saveResult.data.id);

    if (cleanupHoldError) {
      return {
        ok: false,
        message: `The schedule hold was saved, but older duplicate holds could not be cleaned up: ${cleanupHoldError.message}`
      };
    }

    return { ok: true, holdId: saveResult.data.id };
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

  async function loadScheduleHolds() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("schedule_holds")
      .select("id, request_id, term, location, day_of_week, start_minutes, end_minutes, status, active")
      .eq("active", true);

    if (error) {
      setScheduleHolds([]);
      return;
    }

    setScheduleHolds(data || []);
  }

  async function loadRegistrationStatus() {
    if (!supabase) return;

    const { data, error } = await supabase.rpc("is_registration_open");

    if (!error) {
      setRegistrationOpen(data !== false);
    }
  }

  async function loadAdminSettings() {
    if (!supabase || !adminSession) return;

    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["returning_access_code", "registration_open"]);

    if (error) {
      setAdminMessage(`Could not load registration settings: ${error.message}`);
      return;
    }

    const settings = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
    const nextRegistrationOpen = settings.registration_open !== "false";

    setAdminSettings({
      returningAccessCode: settings.returning_access_code || fallbackReturningAccessCode,
      registrationOpen: nextRegistrationOpen
    });
    setRegistrationOpen(nextRegistrationOpen);
  }

  async function validateReturningAccessCode() {
    if (!supabase) return false;

    const { data, error } = await supabase.rpc("validate_returning_access_code", {
      submitted_code: form.accessCode
    });

    if (error) {
      return normalizeAccessCode(form.accessCode) === normalizeAccessCode(fallbackReturningAccessCode);
    }

    return data === true;
  }

  async function checkRegistrationOpen() {
    if (!supabase) return true;

    const { data, error } = await supabase.rpc("is_registration_open");

    if (error) return registrationOpen;

    setRegistrationOpen(data !== false);
    return data !== false;
  }

  async function hasDuplicateRequest() {
    if (!supabase) return false;

    const { data, error } = await supabase.rpc("has_active_student_request", {
      submitted_email: form.email,
      submitted_student_name: form.studentName,
      submitted_term: form.term,
      submitted_family_type: form.familyType
    });

    if (error) return false;

    return data === true;
  }

  async function saveAdminSettings(event) {
    event.preventDefault();
    if (!supabase) return;

    const nextCode = adminSettings.returningAccessCode.trim();
    const nextRegistrationOpen = Boolean(adminSettings.registrationOpen);

    if (!nextCode) {
      setAdminMessage("Enter a returning-family access code before saving.");
      return;
    }

    setAdminLoading(true);
    setAdminMessage("Saving registration settings...");

    const { error } = await supabase
      .from("app_settings")
      .upsert([
        {
          key: "returning_access_code",
          value: nextCode,
          updated_at: new Date().toISOString()
        },
        {
          key: "registration_open",
          value: String(nextRegistrationOpen),
          updated_at: new Date().toISOString()
        }
      ]);

    if (error) {
      setAdminMessage(`Could not save registration settings: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    setRegistrationOpen(nextRegistrationOpen);
    setAdminMessage("Registration settings saved.");
    setAdminLoading(false);
  }

  function downloadApprovedSchedule() {
    if (!approvedScheduleRows.length) {
      setAdminMessage("There are no approved placements to export yet.");
      return;
    }

    const headers = [
      "Schedule",
      "Location",
      "Day",
      "Start time",
      "Student",
      "Parent",
      "Email",
      "Lesson length",
      "First choice",
      "Second choice",
      "Third choice",
      "Notes"
    ];
    const rows = approvedScheduleRows.map((row) => [
      row.term === "summer" ? "Summer" : "School year",
      row.location,
      row.day,
      row.time,
      row.studentName,
      row.parentName,
      row.email,
      `${row.lessonLength} minutes`,
      row.firstChoice,
      row.secondChoice,
      row.thirdChoice,
      row.notes
    ]);

    downloadCsv(`approved-schedule-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    setAdminMessage("Approved schedule CSV downloaded.");
  }

  function downloadVisibleRequests() {
    if (!visibleAdminCards.length) {
      setAdminMessage("There are no visible requests to export.");
      return;
    }

    const headers = [
      "Status",
      "Student",
      "Parent",
      "Email",
      "Location",
      "Lesson length",
      "Choices or notes",
      "Birthdate",
      "Emergency contact",
      "Emergency phone",
      "Signed by",
      "Created"
    ];
    const rows = visibleAdminCards.map((item) => [
      item.status,
      item.name,
      item.parentName,
      item.email,
      item.location,
      item.lessonLength ? `${item.lessonLength} minutes` : "",
      item.choices,
      item.studentBirthdate,
      item.emergencyContact,
      item.emergencyPhone,
      item.signedName,
      item.createdAt
    ]);

    downloadCsv(`${adminFilter}-requests-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    setAdminMessage("Visible requests CSV downloaded.");
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

  async function deleteScheduleRule(rule) {
    const ruleLabel = `${rule.location} ${rule.term === "school" ? "school year" : "summer"} ${rule.day_of_week}, ${formatTime(minutesFromTime(rule.start_time))} to ${formatTime(minutesFromTime(rule.end_time))}`;
    const confirmed = window.confirm(`Remove this teaching block?\n\n${ruleLabel}\n\nParent availability will update immediately.`);

    if (!confirmed) return;

    setAdminLoading(true);
    setScheduleMessage("Removing schedule rule...");

    if (!supabase) {
      setScheduleMessage("Supabase is not configured yet.");
      setAdminLoading(false);
      return;
    }

    const { error } = await supabase
      .from("schedule_rules")
      .delete()
      .eq("id", rule.id);

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
        .select("id, created_at, term, family_type, parent_name, email, student_name, student_birthdate, emergency_contact_name, emergency_contact_phone, lesson_length, location, first_choice, second_choice, third_choice, policy_acknowledged, signed_name, notes, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("waitlist_entries")
        .select("id, created_at, parent_name, email, student_name, student_birthdate, emergency_contact_name, emergency_contact_phone, lesson_length, location, policy_acknowledged, signed_name, notes, status")
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
    await loadScheduleHolds();
    await loadAdminSettings();
    setAdminMessage("Requests loaded.");
    setAdminLoading(false);
  }

  async function updateRequestStatus(item, nextStatus) {
    if (!supabase) return;
    setAdminLoading(true);
    setAdminMessage("Updating request...");

    let activeHoldId = null;
    if (item.table === "registration_requests") {
      const holdResult = await ensureRequestScheduleHold(item, nextStatus);
      if (!holdResult.ok) {
        setAdminMessage(holdResult.message);
        setAdminLoading(false);
        return;
      }
      activeHoldId = holdResult.holdId || null;
    }

    const { error } = await supabase
      .from(item.table)
      .update({ status: nextStatus })
      .eq("id", item.id);

    if (error) {
      setAdminMessage(`Could not update request: ${error.message}`);
      setAdminLoading(false);
      return;
    }

    if (item.table === "registration_requests") {
      const holdActive = ["pending", "approved"].includes(nextStatus);
      const holdUpdate = supabase
        .from("schedule_holds")
        .update({ status: nextStatus, active: holdActive })
        .eq("request_id", item.id);
      const { error: holdError } = activeHoldId && holdActive
        ? await holdUpdate.eq("id", activeHoldId)
        : await holdUpdate;

      if (holdError) {
        setAdminMessage(`Request status changed, but the schedule hold could not be updated: ${holdError.message}`);
        setAdminLoading(false);
        return;
      }
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

    if (!(await checkRegistrationOpen())) {
      setSubmitState({
        status: "error",
        message: "Registration is currently closed. Please contact the studio if you need help."
      });
      return;
    }

    if (!isNewFamily && !(await validateReturningAccessCode())) {
      setSubmitState({
        status: "error",
        message: "Please enter the current returning-family access code before requesting a lesson time."
      });
      return;
    }

    if (!isNewFamily && !form.firstChoice) {
      setSubmitState({
        status: "error",
        message: "Please choose at least a first-choice lesson time."
      });
      return;
    }

    if (await hasDuplicateRequest()) {
      setSubmitState({
        status: "error",
        message: isNewFamily
          ? "This student already has an active waitlist request for this schedule."
          : "This student already has an active registration request for this schedule."
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
      student_birthdate: form.studentBirthdate || null,
      emergency_contact_name: form.emergencyContactName,
      emergency_contact_phone: form.emergencyContactPhone,
      lesson_length: Number(form.lessonLength),
      location: form.location,
      first_choice: isNewFamily ? null : form.firstChoice || null,
      second_choice: isNewFamily ? null : form.secondChoice || null,
      third_choice: isNewFamily ? null : form.thirdChoice || null,
      policy_acknowledged: form.policyAcknowledged,
      signed_name: form.signedName,
      notes: form.notes || null
    };

    const requestId = crypto.randomUUID();
    const table = isNewFamily ? "waitlist_entries" : "registration_requests";
    const insertPayload = isNewFamily
      ? {
          id: requestId,
          parent_name: payload.parent_name,
          email: payload.email,
          student_name: payload.student_name,
          student_birthdate: payload.student_birthdate,
          emergency_contact_name: payload.emergency_contact_name,
          emergency_contact_phone: payload.emergency_contact_phone,
          lesson_length: payload.lesson_length,
          location: payload.location,
          policy_acknowledged: payload.policy_acknowledged,
          signed_name: payload.signed_name,
          notes: payload.notes
        }
      : payload;
    if (!isNewFamily) {
      insertPayload.id = requestId;
    }

    const { error } = await supabase.from(table).insert(insertPayload);

    if (error) {
      setSubmitState({
        status: "error",
        message: `Supabase could not save this yet: ${error.message}`
      });
      return;
    }

    if (!isNewFamily && form.firstChoice) {
      const parsedFirstChoice = parseSlotLabel(form.firstChoice);

      if (parsedFirstChoice) {
        const { error: holdError } = await supabase.from("schedule_holds").insert({
          request_id: requestId,
          term: form.term,
          location: form.location,
          day_of_week: parsedFirstChoice.day,
          start_minutes: parsedFirstChoice.startMinutes,
          end_minutes: parsedFirstChoice.endMinutes,
          status: "pending",
          active: true
        });

        if (holdError) {
          setSubmitState({
            status: "error",
            message: `Request saved, but that time could not be held because it may overlap another request: ${holdError.message}`
          });
          await loadScheduleHolds();
          return;
        }
      }
    }

    setSubmitState({
      status: "success",
      message: isNewFamily
        ? "Waitlist request saved. New students are invited when a regular spot opens."
        : "Registration request saved as pending for teacher approval."
    });
    setForm(initialForm);
    await loadScheduleHolds();
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
              {!registrationOpen && (
                <p className="submit-message error">
                  Registration is currently closed. Please contact the studio if you need help.
                </p>
              )}

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
                  <input required name="accessCode" value={form.accessCode} onChange={updateForm} placeholder="Enter the code you received" />
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
                  Student date of birth
                  <input required type="date" name="studentBirthdate" value={form.studentBirthdate} onChange={updateForm} />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Emergency contact
                  <input required name="emergencyContactName" value={form.emergencyContactName} onChange={updateForm} placeholder="First and last name" />
                </label>
                <label>
                  Emergency phone
                  <input required type="tel" name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={updateForm} placeholder="(000) 000-0000" />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Lesson length
                  <select name="lessonLength" value={form.lessonLength} onChange={updateForm}>
                    {isNewFamily ? (
                      <>
                        <option value="30">4 trial lessons, 30 minutes - $200</option>
                        <option value="45">4 trial lessons, 45 minutes - $290</option>
                        <option value="60">4 trial lessons, 60 minutes - $380</option>
                      </>
                    ) : (
                      <>
                        <option value="30">30 minutes - $180/month</option>
                        <option value="45">45 minutes - $270/month</option>
                        <option value="60">60 minutes - $360/month</option>
                      </>
                    )}
                  </select>
                </label>
                <label>
                  Preferred location
                  <select name="location" value={form.location} onChange={updateForm}>
                    <option value="Vacaville">Vacaville Studio</option>
                    <option value="Davis">Davis Location</option>
                  </select>
                </label>
              </div>

              {!isNewFamily && (
                <section className="time-picker" aria-label="Preferred recurring lesson times">
                  <div className="time-picker-heading">
                    <div>
                      <p className="eyebrow">Preferred recurring times</p>
                      <h3>{form.location} {form.lessonLength}-minute starts</h3>
                    </div>
                    <span>{openSlots.length} available</span>
                  </div>

                  {slotsByDay.length ? (
                    <>
                      <div className="day-grid" aria-label="Choose a preferred day">
                        {slotsByDay.map((group) => (
                          <button
                            className={`day-card ${selectedDay === group.day ? "active" : ""}`}
                            key={group.day}
                            onClick={() => setSelectedDay(group.day)}
                            type="button"
                          >
                            <strong>{group.day}</strong>
                            <span>{group.openCount} open</span>
                          </button>
                        ))}
                      </div>

                      <div className="time-grid" aria-label={`${selectedDay || "Selected day"} times`}>
                        {selectedDaySlots.map((slot) => {
                          const label = slotLabel(slot);
                          const choiceIndex = [form.firstChoice, form.secondChoice, form.thirdChoice].indexOf(label);
                          const isSelected = choiceIndex >= 0;

                          return (
                            <button
                              className={`time-button ${slot.status === "held" ? "held" : ""} ${isSelected ? "selected" : ""}`}
                              disabled={slot.status === "held"}
                              key={label}
                              onClick={() => selectPreferredTime(label)}
                              type="button"
                            >
                              <span>{slot.start}</span>
                              <small>
                                {slot.status === "held"
                                  ? "Held"
                                  : isSelected
                                    ? `Choice ${choiceIndex + 1}`
                                    : "Available"}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <strong>No start times available.</strong>
                      <span>Try a different location or lesson length.</span>
                    </div>
                  )}

                  <div className="choice-summary">
                    {[
                      ["First choice", form.firstChoice],
                      ["Second choice", form.secondChoice],
                      ["Third choice", form.thirdChoice]
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value || "Not selected"}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <label>
                Printed parent or guardian name
                <input required name="signedName" value={form.signedName} onChange={updateForm} placeholder="Typed signature" />
              </label>

              <label className="check-row">
                <input
                  required
                  checked={form.policyAcknowledged}
                  name="policyAcknowledged"
                  onChange={updateForm}
                  type="checkbox"
                />
                <span>I have read and agree to the studio policy, tuition terms, waiver, and media release information.</span>
              </label>

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
                <button className="button primary" type="submit" disabled={submitState.status === "saving" || !registrationOpen}>
                  {submitState.status === "saving" ? "Saving..." : registrationOpen ? "Submit request" : "Registration closed"}
                </button>
              </div>
              {submitState.message && (
                <p className={`submit-message ${submitState.status}`}>{submitState.message}</p>
              )}
            </form>

            <aside className="availability-card guidance-card">
              <p className="eyebrow">How requests work</p>
              <h3>Pick up to three options</h3>
              <p>
                Choose the day first, then select your preferred start times. Your first choice is held while the request is pending.
              </p>
              <div className="mini-rules">
                <span>30, 45, or 60 minutes</span>
                <span>Pending until approved</span>
                <span>No overlapping holds</span>
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
                  <form className="admin-settings" onSubmit={saveAdminSettings}>
                    <div>
                      <p className="eyebrow">Registration settings</p>
                      <h3>Returning-family access code</h3>
                    </div>
                    <label>
                      Current code
                      <input
                        name="returningAccessCode"
                        onChange={updateAdminSettings}
                        placeholder="Example: FALL2026"
                        value={adminSettings.returningAccessCode}
                      />
                    </label>
                    <label className="settings-toggle">
                      <input
                        checked={adminSettings.registrationOpen}
                        name="registrationOpen"
                        onChange={updateAdminSettings}
                        type="checkbox"
                      />
                      <span>Registration open</span>
                    </label>
                    <button className="button secondary" disabled={adminLoading} type="submit">
                      Save code
                    </button>
                  </form>
                  <div className="admin-toolbar">
                    {["pending", "approved", "trial", "waitlist"].map((status) => (
                      <button
                        className={`tab-button ${adminFilter === status ? "active" : ""}`}
                        key={status}
                        onClick={() => setAdminFilter(status)}
                        type="button"
                      >
                        <span>{status === "trial" ? "Trials" : status[0].toUpperCase() + status.slice(1)}</span>
                        <strong>{adminCounts[status]}</strong>
                      </button>
                    ))}
                    <label className="admin-search">
                      <span>Search requests</span>
                      <input
                        onChange={(event) => setAdminSearch(event.target.value)}
                        placeholder="Student, parent, email, notes"
                        value={adminSearch}
                      />
                    </label>
                    <button
                      className="button secondary toolbar-button"
                      disabled={!visibleAdminCards.length}
                      onClick={downloadVisibleRequests}
                      type="button"
                    >
                      Export visible
                    </button>
                  </div>
                  {adminMessage && <p className="admin-message">{adminMessage}</p>}
                  {(scheduleConflictGroups.length > 0 || scheduleHealthIssues.length > 0) && (
                    <section className="conflict-alert" aria-live="polite">
                      <div>
                        <p className="eyebrow">Schedule needs attention</p>
                        <h3>Review schedule conflicts and hold issues</h3>
                        <p>Fix these before treating the schedule as final. Holds are what prevent another family from taking the same time.</p>
                      </div>
                      <div className="conflict-list">
                        {scheduleConflictGroups.map((group) => (
                          <article key={group.title}>
                            <strong>{group.title}</strong>
                            {group.conflicts.map((conflict) => (
                              <span key={conflict}>{conflict}</span>
                            ))}
                          </article>
                        ))}
                        {scheduleHealthIssues.length > 0 && (
                          <article>
                            <strong>Missing or mismatched active holds</strong>
                            {scheduleHealthIssues.map((issue) => (
                              <span key={issue}>{issue}</span>
                            ))}
                          </article>
                        )}
                      </div>
                    </section>
                  )}
                  <section className="schedule-activity">
                    <div className="section-heading compact-heading">
                      <p className="eyebrow">Schedule activity</p>
                      <h3>All approved, pending, trial, and waitlist students</h3>
                      <p>Scheduled rows are grouped by term, location, day, and start time. Waitlist and trial students appear below by location until they have a recurring placement.</p>
                    </div>
                    <div className="activity-legend">
                      {["approved", "pending", "trial", "waitlist"].map((status) => (
                        <span className={`status-pill status-${status}`} key={status}>{status}</span>
                      ))}
                    </div>
                    {scheduleActivityGroups.length ? (
                      <div className="activity-groups">
                        {scheduleActivityGroups.map((group) => (
                          <article className="activity-group" key={group.title}>
                            <h4>{group.title}</h4>
                            <div className="activity-row-list">
                              {group.rows.map((row) => (
                                <div className="activity-row" key={row.id}>
                                  <strong>{row.time}</strong>
                                  <span className={`status-pill status-${row.status}`}>{row.status}</span>
                                  <div>
                                    <b>{row.studentName}</b>
                                    <small>{row.lessonLength} minutes · {row.parentName} · {row.email}</small>
                                    {row.notes && <small>Notes: {row.notes}</small>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <strong>No schedule activity yet.</strong>
                        <span>Pending, approved, trial, and waitlist students will appear here after requests are submitted.</span>
                      </div>
                    )}
                  </section>
                  <section className="approved-schedule">
                    <div className="schedule-summary-heading">
                      <div className="section-heading compact-heading">
                        <p className="eyebrow">Approved schedule</p>
                        <h3>Final recurring placements</h3>
                        <p>Approved requests appear here grouped by schedule, location, day, and start time.</p>
                      </div>
                      <button
                        className="button secondary"
                        disabled={!approvedScheduleRows.length}
                        onClick={downloadApprovedSchedule}
                        type="button"
                      >
                        Download CSV
                      </button>
                    </div>
                    {approvedScheduleGroups.length ? (
                      <div className="approved-groups">
                        {approvedScheduleGroups.map((group) => (
                          <article className="approved-group" key={group.title}>
                            <h4>{group.title}</h4>
                            <div className="approved-row-list">
                              {group.rows.map((row) => (
                                <div className="approved-row" key={row.id}>
                                  <strong>{row.time}</strong>
                                  <span>{row.studentName}</span>
                                  <small>{row.lessonLength} minutes · {row.parentName} · {row.email}</small>
                                  {renderMovePicker(row, true)}
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <strong>No approved placements yet.</strong>
                        <span>Approved registration requests will appear here as your final schedule takes shape.</span>
                      </div>
                    )}
                  </section>
                  <div className="admin-list">
                    {visibleAdminCards.length ? (
                      visibleAdminCards.map((item) => {
                        return (
                          <article className="admin-card" key={`${item.table}-${item.id}`}>
                            <span className={`status-pill status-${item.status}`}>{item.status}</span>
                            <h3>{item.name}</h3>
                            {item.createdAt && <p className="card-meta">Submitted {formatDateTime(item.createdAt)}</p>}
                            <p>{item.details}</p>
                            <p>{item.choices}</p>
                            {item.parentName && <p>Parent: {item.parentName}</p>}
                            <p>Email: {item.email}</p>
                            {item.studentBirthdate && <p>Birthdate: {item.studentBirthdate}</p>}
                            {item.emergencyContact && <p>Emergency contact: {item.emergencyContact}</p>}
                            {item.emergencyPhone && <p>Emergency phone: {item.emergencyPhone}</p>}
                            {item.signedName && <p>Signed by: {item.signedName}</p>}
                            {item.notes && <p>Notes: {item.notes}</p>}
                            {item.table === "registration_requests" && ["pending", "approved"].includes(item.status) && (
                              <div className="move-tool">
                                {renderMovePicker(item)}
                              </div>
                            )}
                            <div className="admin-card-actions">
                              <a className="button secondary" href={mailtoForItem(item)}>
                                Email parent
                              </a>
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
                        );
                      })
                    ) : (
                      <div className="empty-state">
                        <strong>No matching {adminFilter} requests.</strong>
                        <span>{adminSearch ? "Try a different search term." : "New submissions will appear here after parents use the registration form."}</span>
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
                      <button className="text-button" type="button" onClick={() => deleteScheduleRule(rule)}>Remove</button>
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
