const TennisGame = require("./TennisGame");
const GameManager = require("../games/GameManager");

module.exports = (app, io) => {
  options = {
    path: "/tennis",
    room: { minPlayers: 2, maxPlayers: 2 },
    files: [
      { path: "/", fileName: __dirname + "/index.html" },
      { path: "/tennisClient.js", fileName: __dirname + "/tennisClient.js" }
    ],
    gameClass: TennisGame
  };

  new GameManager(app, io, options);
};
