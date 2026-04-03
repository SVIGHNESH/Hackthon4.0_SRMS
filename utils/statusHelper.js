const CANONICAL_STATUSES = ["Pending", "In Progress", "Solved", "Rejected", "Escalated"];

const statusMappings = {
    "pending": "Pending",
    "in-progress": "In Progress",
    "in progress": "In Progress",
    "inprogress": "In Progress",
    "solved": "Solved",
    "rejected": "Rejected",
    "escalated": "Escalated"
};

const normaliseStatus = (status) => {
    if (!status) return "Pending";
    const normalized = status.toLowerCase().trim();
    return statusMappings[normalized] || (CANONICAL_STATUSES.includes(status) ? status : "Pending");
};

const isValidStatus = (status) => {
    return CANONICAL_STATUSES.includes(status);
};

module.exports = { normaliseStatus, isValidStatus, CANONICAL_STATUSES };
