class LudoPlayer {
    constructor(socketio, user, chips, color) {
        this.socketio = socketio;     
        this.user = user;
        this.chips = Number(chips);
        this.color = color; // 'green', 'yellow', 'red', 'blue'
    }

    send(event, data) {
        if (this.socketio && this.socketio.connected) {
            this.socketio.emit(event, data);
        }
    }
}

module.exports = LudoPlayer;
