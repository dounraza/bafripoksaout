class PokerPlayer {
    constructor(socketio, user, chips) {
        this.socketio = socketio;     
        this.user = user;
        this.seatIndex = undefined;
        this.chips = chips;
        this.quiteDate = new Date(Date.now() + 45 * 60 * 1000);
        this.exitTime = null;
    }

    send(event, data) {
        if (this.socketio && this.socketio.connected) {
            this.socketio.emit(event, data);
        }
    }
    
    updateExitTime() {
      this.exitTime = Date.now();
    }
}

module.exports = PokerPlayer;