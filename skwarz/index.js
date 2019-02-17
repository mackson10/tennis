const SkwarzGame = require("./SkwarzGame");
const GameManager = require("../games/GameManager");

module.exports = (app, io) => {
  const options = {
    path: "/skwarz",
    room: { minPlayers: 2, maxPlayers: 10 },
    files: [
      { path: "/", fileName: __dirname + "/index.html" },
      { path: "/skwarzClient.js", fileName: __dirname + "/skwarzClient.js" }
    ],
    gameClass: SkwarzGame
  };

  new GameManager(app, io, options);
};