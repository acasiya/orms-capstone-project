// O.R.M.S. — placeholder account records for the admin "Manage Accounts" page.
// activityMinutes: 0 means currently active/online; otherwise minutes since last active,
// used to sort by "Most Recently Active".

const ACCOUNTS = [
  { id: "000001", owner: "Liza Almoreno", email: "liza.almoreno@gmail.com", type: "Administrator", active: true, activityMinutes: 0, created: "1 Year Ago", updated: "2 Months Ago" },
  { id: "000002", owner: "Joseph Michael", email: "joseph.michael@gmail.com", type: "Administrator", active: false, lastActiveLabel: "4 Hours Ago", activityMinutes: 240, created: "1 Year Ago", updated: "3 Months Ago" },
  { id: "2024001", owner: "Eliseo Aurelio Jr.", email: "eliseo.aurelio@gmail.com", type: "Barangay Captain", active: true, activityMinutes: 0, created: "8 Months Ago", updated: "1 Month Ago" },
  { id: "2024002", owner: "Dan Paul Tarzona", email: "danpaul.tarzona@gmail.com", type: "Secretary", active: true, activityMinutes: 0, created: "8 Months Ago", updated: "1 Month Ago" },
  { id: "2024015", owner: "Detective Conan", email: "detective.conan@gmail.com", type: "Investigator", active: true, activityMinutes: 0, created: "6 Months Ago", updated: "3 Weeks Ago" },
  { id: "2024016", owner: "Dexter Morgan", email: "dexter.morgan@gmail.com", type: "Investigator", active: false, lastActiveLabel: "8 Hours Ago", activityMinutes: 480, created: "6 Months Ago", updated: "5 Days Ago" },
  { id: "2024017", owner: "Bruce Wayne", email: "bruce.wayne@gmail.com", type: "Investigator", active: false, lastActiveLabel: "16 Hours Ago", activityMinutes: 960, created: "5 Months Ago", updated: "16 Hours Ago" },
  { id: "0000034", owner: "Risa Hontiveros", email: "risa.hontiveros@gmail.com", type: "Barangay Citizen", active: true, activityMinutes: 0, created: "3 Weeks Ago", updated: "3 Weeks Ago" },
  { id: "0000033", owner: "Bam Aquino", email: "bambam80@gmail.com", type: "Barangay Citizen", active: false, lastActiveLabel: "1 Day Ago", activityMinutes: 1440, created: "7 Days Ago", updated: "7 Days Ago" },
];
