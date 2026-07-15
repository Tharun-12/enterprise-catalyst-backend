const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "enterprise-catalyst",
  port: 4306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = db;