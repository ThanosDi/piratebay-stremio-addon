const fetch = require("node-fetch");

fetch(`https://api.heroku.com/apps/${process.env.APP_NAME}/dynos`, {
  method: "delete",
  body: JSON.stringify({}),
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${process.env.TOKEN}`,
    accept: "application/vnd.heroku+json; version=3"
  }
})
  .then(res => res.json())
  .then(json => console.log("Restarting..."));
