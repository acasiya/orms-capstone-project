// O.R.M.S. — placeholder "My Reports" records for the logged-in citizen.

const TIMELINE_STEPS = ["Submitted", "Under Review", "For Action", "Final Verdict"];
const TIMELINE_DESCRIPTIONS = [
  "Your report has been submitted successfully.",
  "Your report is being reviewed",
  "Appropriate actions are being taken.",
  "Report is finished and closed.",
];

function buildTimeline(completedSteps, dates) {
  return TIMELINE_STEPS.map((label, i) => ({
    label,
    description: TIMELINE_DESCRIPTIONS[i],
    date: i < completedSteps ? dates[i][0] : null,
    time: i < completedSteps ? dates[i][1] : null,
  }));
}

const MY_REPORTS = [
  {
    id: "noise-complaint-1",
    title: "Noise Complaint",
    dateSubmitted: "May 20, 2026",
    status: "Submitted",
    location: "Block 11, Lot 13, Kitty Street",
    ordinance: "Noise Nuisance and Noise Pollution",
    incidentDate: "2026-07-06",
    incidentTime: "11:30 PM",
    natureOfViolation:
      "The Neighbor at Block 11 Lot 13 in Kitty Street is still having karaoke at 11:30 PM",
    completedSteps: 1,
    timeline: buildTimeline(1, [["July 6, 2025", "11:40 PM"]]),
  },
  {
    id: "illegal-parking-1",
    title: "Illegal Parking",
    dateSubmitted: "June 8, 2026",
    status: "With Remarks",
    location: "Block 11, Lot 13, Kitty Street",
    ordinance: "Illegal Parking and Road Obstruction",
    incidentDate: "2026-07-16",
    incidentTime: "10:11 AM",
    natureOfViolation: "The people in Block 1 lot 21 are mad, they parked their car like this in the curb.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["July 16, 2025", "10:15 AM"],
      ["July 16, 2025", "10:18 AM"],
      ["July 16, 2025", "10:23 PM"],
      ["July 16, 2025", "10:45 PM"],
    ]),
    remarks:
      "There was a critical emergency concerning the owner's family. The car will be correctly parked after the owner returns from the emergency.",
  },
  {
    id: "improper-waste-disposal-1",
    title: "Improper Waste Disposal",
    dateSubmitted: "May 20, 2026",
    status: "Resolved",
    location: "Near the public market entrance, Purok 3",
    ordinance: "Solid Waste Management and Sanitation",
    incidentDate: "2026-05-20",
    incidentTime: "7:00 AM",
    natureOfViolation:
      "Garbage has been left uncollected near the market entrance for several days, causing a foul odor.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["May 20, 2026", "7:10 AM"],
      ["May 21, 2026", "9:00 AM"],
      ["May 22, 2026", "1:30 PM"],
      ["May 24, 2026", "10:00 AM"],
    ]),
  },
  {
    id: "street-vendor-obstruction-1",
    title: "Street Vendor Obstruction",
    dateSubmitted: "April 1, 2026",
    status: "In Process",
    location: "Block 8 lot 1, Sampaguita Street",
    ordinance: "Anti-Illegal Vending and Sidewalk Obstruction",
    incidentDate: "2026-07-07",
    incidentTime: "12:32 PM",
    natureOfViolation:
      "There is always an obstruction in the side of the street in Sampaguita Street, and cars cannot pass by and there is always garbage left over.",
    completedSteps: 2,
    timeline: buildTimeline(2, [
      ["July 7, 2025", "12:38 PM"],
      ["July 7, 2025", "12:55 PM"],
    ]),
  },
  {
    id: "noise-disturbance-1",
    title: "Noise Disturbance",
    dateSubmitted: "March 4, 2026",
    status: "Resolved",
    location: "Purok 2, Ilang-Ilang Street",
    ordinance: "Noise Nuisance and Noise Pollution",
    incidentDate: "2026-03-04",
    incidentTime: "10:00 PM",
    natureOfViolation:
      "Videoke sessions extending past midnight on weekdays, disturbing nearby households.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["March 4, 2026", "10:20 PM"],
      ["March 5, 2026", "9:00 AM"],
      ["March 6, 2026", "2:00 PM"],
      ["March 7, 2026", "11:00 AM"],
    ]),
  },
  {
    id: "illegal-parking-2",
    title: "Illegal Parking",
    dateSubmitted: "February 18, 2026",
    status: "Resolved",
    location: "Block 3, Lot 67, Bonifacio Street",
    ordinance: "Illegal Parking and Road Obstruction",
    incidentDate: "2026-07-10",
    incidentTime: "3:21 PM",
    natureOfViolation:
      "The car in front of Blk 10 lot 55 is parked incorrectly and illegally, causing inconvenience for passing vehicles.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["July 10, 2025", "3:25 PM"],
      ["July 10, 2025", "3:30 PM"],
      ["July 10, 2025", "3:35 PM"],
      ["July 10, 2025", "3:50 PM"],
    ]),
  },
  {
    id: "improper-waste-disposal-2",
    title: "Improper Waste Disposal",
    dateSubmitted: "January 15, 2026",
    status: "Resolved",
    location: "Purok 5, near the covered court",
    ordinance: "Solid Waste Management and Sanitation",
    incidentDate: "2026-01-15",
    incidentTime: "6:45 AM",
    natureOfViolation:
      "Household waste dumped along the roadside instead of using designated collection points.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["January 15, 2026", "7:00 AM"],
      ["January 16, 2026", "9:15 AM"],
      ["January 17, 2026", "3:00 PM"],
      ["January 18, 2026", "10:30 AM"],
    ]),
  },
  {
    id: "street-vendor-obstruction-2",
    title: "Street Vendor Obstruction",
    dateSubmitted: "December 30, 2025",
    status: "Resolved",
    location: "Along Barangay Hall frontage",
    ordinance: "Anti-Illegal Vending and Sidewalk Obstruction",
    incidentDate: "2025-12-30",
    incidentTime: "4:10 PM",
    natureOfViolation: "Vendor stalls blocking the sidewalk in front of the Barangay Hall.",
    completedSteps: 4,
    timeline: buildTimeline(4, [
      ["December 30, 2025", "4:20 PM"],
      ["December 31, 2025", "9:00 AM"],
      ["January 1, 2026", "2:00 PM"],
      ["January 2, 2026", "11:45 AM"],
    ]),
  },
];
