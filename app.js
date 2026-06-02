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

const adminItems = [
  {
    status: "pending",
    name: "Maya Chen",
    details: "Returning student requesting Wednesday 4:15 PM in Vacaville, 45 minutes.",
    choices: "Alternates: Friday 5:00 PM, Monday 3:00 PM"
  },
  {
    status: "pending",
    name: "Eli Thompson",
    details: "Returning student requesting Tuesday 3:00 PM in Davis, 45 minutes.",
    choices: "Alternates: Thursday 6:30 PM, Saturday 9:00 AM"
  },
  {
    status: "approved",
    name: "Sofia Garcia",
    details: "Approved for Monday 3:30 PM in Vacaville, 45 minutes.",
    choices: "Ready to sync as a weekly Google Calendar event."
  },
  {
    status: "trial",
    name: "Noah Patel",
    details: "4-lesson trial offered for Tuesday 5:15 PM in Davis.",
    choices: "Trial lesson 2 of 4."
  },
  {
    status: "waitlist",
    name: "Ava Williams",
    details: "New student waitlisted for Davis, 30 or 45 minutes.",
    choices: "Available Tuesdays after 4:30 PM and Saturdays before noon."
  }
];

const termSelect = document.querySelector("#termSelect");
const familyType = document.querySelector("#familyType");
const locationSelect = document.querySelector("#locationSelect");
const lessonLength = document.querySelector("#lessonLength");
const accessCodeField = document.querySelector("#accessCodeField");
const registrationHint = document.querySelector("#registrationHint");
const slotList = document.querySelector("#slotList");
const availabilityTitle = document.querySelector("#availabilityTitle");
const openSlotsCount = document.querySelector("#openSlotsCount");
const pendingCount = document.querySelector("#pendingCount");
const choiceSelects = [
  document.querySelector("#firstChoice"),
  document.querySelector("#secondChoice"),
  document.querySelector("#thirdChoice")
];
const adminList = document.querySelector("#adminList");
const registrationForm = document.querySelector("#registrationForm");

function slotLabel(slot) {
  return `${slot.day} at ${slot.start} (${slot.length} minutes)`;
}

function getFilteredSlots() {
  const term = schedules[termSelect.value];
  const slots = term.locations[locationSelect.value] || [];
  const length = Number(lessonLength.value);
  return slots.filter((slot) => slot.length === length);
}

function renderAvailability() {
  const location = locationSelect.value;
  const slots = getFilteredSlots();
  const openSlots = slots.filter((slot) => slot.status === "open");

  availabilityTitle.textContent = `${location} openings`;
  slotList.innerHTML = slots.length
    ? slots
        .map(
          (slot) => `
            <div class="slot ${slot.status === "held" ? "held" : ""}">
              <strong>${slotLabel(slot)}</strong>
              <span class="slot-meta">${slot.status === "held" ? "Held pending approval" : "Available to request"}</span>
            </div>
          `
        )
        .join("")
    : `<div class="slot"><strong>No exact matches</strong><span class="slot-meta">Try a different lesson length or join the waitlist.</span></div>`;

  choiceSelects.forEach((select, index) => {
    const placeholder = index === 0 ? "Choose first choice" : `Choose choice ${index + 1}`;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    openSlots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slotLabel(slot);
      option.textContent = slotLabel(slot);
      select.append(option);
    });
  });

  const allOpen = Object.values(schedules[termSelect.value].locations)
    .flat()
    .filter((slot) => slot.status === "open").length;
  const allHeld = Object.values(schedules[termSelect.value].locations)
    .flat()
    .filter((slot) => slot.status === "held").length;

  openSlotsCount.textContent = allOpen;
  pendingCount.textContent = allHeld;
}

function renderFamilyMode() {
  const isNew = familyType.value === "new";
  accessCodeField.hidden = isNew;
  registrationHint.textContent = isNew
    ? "New families join the waitlist first. Trial lessons are offered only when a regular spot opens."
    : "Returning family requests are held as pending until teacher approval.";

  choiceSelects.forEach((select) => {
    select.disabled = isNew;
  });
}

function renderAdmin(filter = "pending") {
  const items = adminItems.filter((item) => item.status === filter);
  adminList.innerHTML = items
    .map(
      (item) => `
        <article class="admin-card">
          <span class="status-pill status-${item.status}">${item.status}</span>
          <h3>${item.name}</h3>
          <p>${item.details}</p>
          <p>${item.choices}</p>
          <button class="button secondary" type="button">Review</button>
        </article>
      `
    )
    .join("");
}

document.querySelectorAll("[data-admin-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-filter]").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    renderAdmin(button.dataset.adminFilter);
  });
});

[termSelect, locationSelect, lessonLength].forEach((control) => {
  control.addEventListener("change", renderAvailability);
});

familyType.addEventListener("change", renderFamilyMode);

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(registrationForm);
  const name = formData.get("studentName") || "Student";
  const mode = formData.get("familyType") === "new" ? "waitlist request" : "lesson request";
  alert(`${name}'s ${mode} has been saved as pending in this prototype.`);
});

renderAvailability();
renderFamilyMode();
renderAdmin();
