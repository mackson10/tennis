var app = require("express")();
var server = require("http").Server(app);
var io = require("socket.io")(server);
const tennisGame = require("./tennis");
const skwarzGame = require("./skwarz");
const serverPort = process.env.PORT || 8000;

server.listen(serverPort);
app.serverPort = serverPort;

app.get("/", function(req, res) {
  res.sendFile(__dirname + "/client/index.html");
});

tennisGame(app, io);
skwarzGame(app, io);
