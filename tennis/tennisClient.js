class Tennis {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.status = "not_on_queue";
    canvas.onclick = () => this.canvasClick();
    this.drawUI(null, "Click to enter the queue");
    this.initInputHandler();
    this.keysdown = [];
    this.ping = 0;
  }

  setStatus(status) {
    this.status = status;
    switch (status) {
      case "queue_requested":
        this.drawUI(null, "Requesting Queue");
        break;
      case "on_queue":
        this.drawUI(null, "Waiting on queue");
        break;
      case "connected":
        this.drawUI(null, "Connected, waiting players");
        break;
      case "starting":
        this.drawUI(null, "Starting Game");
        break;
      case "running":
        break;
    }
  }

  canvasClick() {
    switch (this.status) {
      case "not_on_queue":
        this.requestQueue();
        break;
      case "showing_score":
        this.reinit();
        break;
    }
  }

  requestQueue() {
    axios.get("/tennis/queue").then(resp => {
      this.queueIo = io.connect(window.location.origin + resp.data.path);
      this.ticket = resp.data;
      this.queueIo.emit("confirm", resp.data);
      this.setQueueIo();
    });
    this.setStatus("queue_requested");
  }

  setQueueIo() {
    this.setStatus("on_queue");
    this.queueIo.on("start", data => {
      this.gameIo = io.connect(window.location.origin + data.path);
      this.setGameIo();
      this.queueIo.disconnect();
    });
    this.queueIo.on("players", data => console.log(data));
  }

  setGameIo() {
    this.setStatus("connected");
    this.gameIo.emit("enterGame", this.ticket);
    this.gameIo.on("players", data => console.log(data));
    this.gameIo.on("setup", data => this.setupGame(data));
    this.gameIo.on("state", data => this.updateState(data));
    this.gameIo.on("endGame", data => this.endGame(data));
  }

  endGame(endState) {
    const winner = endState.winner;
    this.setStatus("end_game");
    let endMessage = "";
    if (winner.pid === this[this.myRole].id) {
      endMessage = "You won! Congrats!";
    } else {
      endMessage = "You lost, keep training!";
    }

    this.gameIo.disconnect();
    this.drawUI(null, "Starting Game");
    this.drawUI(null, endMessage);
    this.scoreTimer = setTimeout(() => {
      this.setStatus("showing_score");
      this.drawUI("endScreen", endState);
    }, 3000);
  }

  reinit() {
    game = new Tennis(this.canvas);
  }

  setupGame(data) {
    this.setStatus("starting");
    this.myRole = data.players[this.ticket.id].role;
  }

  updateState(data) {
    if (this.status !== "running") this.setStatus("running");

    this.ping = new Date().getTime() - data.time;
    console.log("ping: " + this.ping);

    for (let playerId in data.players) {
      let player = data.players[playerId];
      this[player.role] = player;
    }
    this.state = data;
    this.drawGame();
  }

  drawGame() {
    const ctx = this.ctx;
    const state = this.state;

    ctx.clearRect(0, 0, 500, 500);
    ctx.fillStyle = "black";

    state.projectiles.forEach(bullet => {
      ctx.strokeStyle = "black 2px";
      ctx.fillStyle = "brown";
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      ctx.strokeRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });

    state.balls.forEach(ball => {
      ctx.beginPath();
      ctx.strokeStyle = "black 2px";
      ctx.fillStyle = ball.color;
      ctx.arc(ball.x, ball.y, ball.size * 2, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();
    });

    this.drawPlayer(this.P1);
    this.drawPlayer(this.P2);

    this.drawUI("RunningGame");
  }

  drawPlayer(player) {
    const ctx = this.ctx;

    const pState = player.state;
    const pGameInfo = player.gameInfo;

    ctx.fillStyle = "blue";
    ctx.fillStyle = pGameInfo.color;
    ctx.fillRect(pState.x, pState.y, pState.width, pState.height);
    ctx.fillStyle = "red";
    ctx.fillRect(pState.x + pState.width / 2 - 5, pState.y, 10, pState.height);
    ctx.strokeStyle = "black 2px";
    ctx.strokeRect(pState.x, pState.y, pState.width, pState.height);
  }

  drawUI(action, data) {
    const ctx = this.ctx;

    ctx.font = "30px Arial";
    ctx.textAlign = "center";

    switch (action) {
      case "RunningGame":
        ctx.fillStyle = "black";

        ctx.fillText(this.myRole === "P1" ? "You" : "P1", 440, 40);
        ctx.fillText(
          this.state.players[this.P1.id].gameInfo.points + " Pts",
          440,
          70
        );
        ctx.fillText(
          this.state.players[this.P1.id].gameInfo.lifes + " lifes",
          440,
          100
        );

        ctx.fillText(this.myRole === "P2" ? "You" : "P2", 440, 410);
        ctx.fillText(
          this.state.players[this.P2.id].gameInfo.points + " Pts",
          440,
          440
        );

        ctx.fillText(
          this.state.players[this.P2.id].gameInfo.lifes + " lifes",
          440,
          470
        );
        break;
      case "endScreen":
        ctx.fillStyle = "yellow";
        ctx.fillRect(0, 0, 500, 500);
        ctx.fillStyle = "black";
        let startX = 150;
        let startY = 240;

        ctx.fillText("Score", 250, startY - 70);

        ctx.fillText(this.myRole === "P1" ? "You" : "P1", startX, startY);
        ctx.fillText(
          this.state.players[this.P1.id].gameInfo.points + " Pts",
          startX,
          startY + 70
        );
        ctx.fillText(
          this.state.players[this.P1.id].gameInfo.lifes + " lifes",
          startX,
          startY + 30
        );
        ctx.fillStyle = "black";
        startX += 200;
        startY += 0;

        ctx.fillText(this.myRole === "P2" ? "You" : "P2", startX, startY);
        ctx.fillText(
          this.state.players[this.P2.id].gameInfo.points + " Pts",
          startX,
          startY + 70
        );
        ctx.fillText(
          this.state.players[this.P2.id].gameInfo.lifes + " lifes",
          startX,
          startY + 30
        );
        ctx.fillText("Click to continue ", 250, startY + 130);
        break;
      default:
        ctx.clearRect(0, 0, 500, 500);
        ctx.fillStyle = "yellow";
        ctx.fillRect(20, 200, 460, 90);
        ctx.lineWidth = 2;
        ctx.strokeWidth = "brown";
        ctx.strokeRect(20, 200, 460, 90);

        ctx.fillStyle = "black";
        ctx.fillText(data, 250, 250);
        break;
    }
  }

  shoot() {
    this.gameIo.emit("shoot");
  }

  inputHandler() {
    if (this.keysdown.length < 1) return;
    const isDown = key => this.keysdown.includes(key.toLowerCase());

    if (isDown("w")) {
    }
    if (isDown("s")) {
    }
    if (isDown(" ")) {
      this.shoot();
    }
    if (isDown("a")) {
      if (this.status === "running") {
        this.movePlayer("x", -10);
      }
    }
    if (isDown("d")) {
      if (this.status === "running") {
        this.movePlayer("x", 10);
      }
    }
  }

  movePlayer(axis, delta) {
    this.gameIo.emit("move", { axis, delta });
  }

  initInputHandler() {
    document.onkeydown = e => {
      if (this.keysdown.indexOf(e.key.toLowerCase()) < 0) {
        this.keysdown.push(e.key.toLowerCase());
      }
    };
    document.onkeyup = e => {
      this.keysdown = this.keysdown.filter(k => k != e.key.toLowerCase());
    };
    setInterval(e => this.inputHandler(e), 30);
  }
}

canvas = document.querySelector("canvas");

let game = new Tennis(canvas);
