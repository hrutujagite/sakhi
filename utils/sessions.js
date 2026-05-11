// Shared in-memory session store.
// Exporting a single object reference ensures all modules
// read and write the same data without passing it as a parameter.
const sessions = {};

module.exports = sessions;
