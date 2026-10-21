import { buildMockContributionData, normalizeContributionData } from '../data/contributions.js';
import { formatDate } from '../utils/dates.js';

export function initializeProfile(graph) {
  const graphTitle = document.querySelector("#graph-title");
  const dateRange = document.querySelector("#date-range");
  const activityBadge = document.querySelector("#activity-badge");
  const dataSource = document.querySelector("#data-source");
  const openProfile = document.querySelector("#open-profile");
  const userForm = document.querySelector("#user-form");
  const usernameInput = document.querySelector("#username-input");
  const loadButton = document.querySelector("#load-button");
  const profileStatus = document.querySelector("#profile-status");
  const yearTabs = document.querySelector("#year-tabs");
  const totalEl = document.querySelector("#total-contributions");
  const activeDaysEl = document.querySelector("#active-days");
  const streakEl = document.querySelector("#longest-streak");
  const bestDayEl = document.querySelector("#best-day");
  const bestDayDateEl = document.querySelector("#best-day-date");
  let activeUsername = usernameInput.value.trim();
  let displayedUsername = activeUsername;
  let selectedYear = String(new Date().getFullYear());
  let allContributions = null;
  let requestId = 0;
  let isSampleData = true;
  const { setSceneLoading } = graph;
  function buildGraph(data) {
    graph.buildGraph(data);
    updateStats(data);
  }
  buildGraph(buildMockContributionData(selectedYear));
  renderYearTabs(Object.fromEntries(Array.from({ length: 7 }, (_, index) => [Number(selectedYear) - index, 0])));
  updateProfileHeader();
  userForm.addEventListener('submit', loadUserContributions);
  yearTabs.addEventListener('click', onYearTabClick);
  void loadUserContributions();

  function updateProfileHeader() {
    graphTitle.textContent = displayedUsername;
    dateRange.textContent = `${selectedYear}-01-01 — ${selectedYear}-12-31`;
    activityBadge.lastChild.textContent = isSampleData ? "Sample activity" : "Public activity";
    dataSource.textContent = isSampleData
      ? "Sample activity. Load a profile to show public contributions."
      : "Public activity via the community contributions API.";
    openProfile.href = `https://github.com/${encodeURIComponent(displayedUsername)}`;
  }

  async function loadUserContributions(event) {
    event?.preventDefault();
    activeUsername = usernameInput.value.trim().replace(/^@/, "");
    if (!activeUsername) return;

    const currentRequestId = ++requestId;
    loadButton.disabled = true;
    loadButton.firstChild.textContent = "Loading... ";
    setSceneLoading(true);
    profileStatus.dataset.status = "loading";
    profileStatus.textContent = `Fetching contribution history for @${activeUsername}...`;

    try {
      const response = await fetch(
        `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(activeUsername)}?y=all`,
      );
      if (!response.ok) throw new Error(response.status === 404 ? "User not found." : "Request failed.");

      const payload = await response.json();
      if (currentRequestId !== requestId) return;

      const availableYears = Object.keys(payload.total || {}).filter(year => /^\d{4}$/.test(year)).sort((a, b) => Number(b) - Number(a));
      const requestedYear = availableYears.length && !availableYears.includes(selectedYear) ? availableYears[0] : selectedYear;
      const data = normalizeContributionData(payload.contributions, Number(requestedYear));
      if (!data) throw new Error("No contribution data was returned.");
      selectedYear = requestedYear;
      allContributions = payload.contributions;
      isSampleData = false;
      displayedUsername = activeUsername;
      renderYearTabs(payload.total);
      buildGraph(data);
      updateProfileHeader();
      profileStatus.dataset.status = "success";
      profileStatus.textContent = `Showing ${selectedYear} contributions for @${activeUsername}.`;
    } catch (error) {
      if (currentRequestId !== requestId) return;
      profileStatus.dataset.status = "error";
      profileStatus.textContent = error.message || "Could not load that GitHub profile.";
    } finally {
      if (currentRequestId === requestId) {
        loadButton.disabled = false;
        loadButton.firstChild.textContent = "Load profile ";
        setSceneLoading(false);
      }
    }
  }

  function loadYear(year) {
    if (graph.isFetching) return;

    selectedYear = String(year);
    const data = isSampleData ? buildMockContributionData(selectedYear) : normalizeContributionData(allContributions, Number(selectedYear));
    if (!data) return;

    buildGraph(data);
    profileStatus.dataset.status = "success";
    profileStatus.textContent = isSampleData ? `Showing sample activity for ${selectedYear}. Load a profile for public contributions.` : `Showing ${selectedYear} contributions for @${displayedUsername}.`;
    updateProfileHeader();
    renderYearTabsFromCurrentSelection();
  }

  function onYearTabClick(event) {
    const tab = event.target.closest("[data-year]");
    if (!tab || tab.getAttribute("aria-selected") === "true") return;
    loadYear(tab.dataset.year);
  }

  function renderYearTabs(total) {
    const years = Object.keys(total || {})
      .filter((year) => /^\d{4}$/.test(year))
      .sort((a, b) => Number(b) - Number(a));
    if (!years.includes(selectedYear)) years.unshift(selectedYear);

    yearTabs.innerHTML = years
      .map(
        (year) =>
          `<button class="h-8.75 rounded-[5px] border border-border px-1.25 font-mono text-[12px] text-muted aria-selected:border-accent aria-selected:bg-selected aria-selected:text-accent" type="button" role="tab" data-year="${year}" aria-selected="${
            year === selectedYear
          }">${year}</button>`,
      )
      .join("");
  }

  function renderYearTabsFromCurrentSelection() {
    for (const tab of yearTabs.querySelectorAll("[data-year]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.year === selectedYear));
    }
  }

  function updateStats(data) {
    const pastDays = data.filter((item) => !item.isFuture);
    const total = pastDays.reduce((sum, item) => sum + item.count, 0);
    const activeDays = pastDays.filter((item) => item.count > 0).length;

    let longestStreak = 0;
    let currentStreak = 0;
    for (const item of pastDays) {
      if (item.count > 0) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    totalEl.textContent = total.toLocaleString();
    activeDaysEl.textContent = activeDays.toLocaleString();
    streakEl.textContent = `${longestStreak} day${longestStreak === 1 ? "" : "s"}`;
    const bestDay = pastDays.reduce(
      (best, day) => day.count > (best?.count ?? 0) ? day : best,
      null,
    );
    bestDayEl.textContent = bestDay ? bestDay.count.toLocaleString() : "0";
    bestDayEl.title = bestDay ? `${bestDay.count} contributions on ${formatDate(bestDay.date)}` : "No activity yet";
    bestDayDateEl.textContent = bestDay ? formatDate(bestDay.date) : "No activity yet";
  }
}
