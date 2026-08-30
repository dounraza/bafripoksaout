require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const sequelize = require("./config/Db");
const authRoutes = require("./routes/authRoutes");
const authAdminRoutes = require("./routes/UserAdminRoutes");
const soldeRoutes = require("./routes/soldeRoutes");
const soldeAdminRoutes = require("./routes/soldeAdminRoutes");
const depotMobileRoutes = require("./routes/DepotModileMoneyRoutes");
const depotCryptoRoutes = require("./routes/DepotCryptoMoneyRoutes");
const retraitCrypto = require("./routes/RetraitCryptoRoutes");
const retraitMobile = require("./routes/RetraitMobileRoutes");
const typeCrypto = require("./routes/TypeRoutes");
const tableRoutes = require("./routes/tableRoute"); 
const EnvoieRoutes = require("./routes/EnvoieRoutes"); 
const protect = require('./middleware/authMiddleware');
const { serverSocket } = require("./serverSocket");
const historiqueRoutes = require("./routes/HistoriqueMainRoutes");
const userConnectedRoutes = require("./routes/userConnected");
const userRoutes = require("./routes/userRoutes");


require('./model/Envoie');
require('./model/UserAdmin');
require('./model/DepotCryptoMoney');
require('./model/DepotMobileMoney');
require('./model/RetraitCryptoMoney');
require('./model/RetraitMobileMoney');
require('./model/Soldes');
require('./model/Table');
require('./model/TypeCryptoMoney');
require('./model/User');
sequelize.authenticate()
  .then(() => {
    console.log("Connexion à MySQL réussie.");
    // return sequelize.sync({ force: true });
  })
  .catch(err => console.error("Échec de connexion à MySQL :", err));

const corsOptions = {
  origin: "*"
};

const app = express();

app.use(cors(corsOptions));
app.use('/uploads/avatars', express.static(path.resolve(__dirname, 'public', 'avatars')));


app.use(express.json({ extended: false }));

app.use("/api/auth", authRoutes);
app.use("/api/auth/admin", authAdminRoutes);
app.use("/api/solde", soldeRoutes); // Specific route for public solde access
app.use("/api", protect, soldeAdminRoutes);
app.use("/api/depot", protect, depotMobileRoutes);
app.use("/api/depot", protect, depotCryptoRoutes);
app.use("/api", protect, typeCrypto);
app.use("/api/retrait", protect, retraitMobile);
app.use("/api/retrait", protect, retraitCrypto);
app.use("/api/tables", protect, tableRoutes);
app.use("/api", protect, EnvoieRoutes);
app.use("/api/historique", protect, historiqueRoutes);
app.use("/api/userConnected", userConnectedRoutes);
app.use("/api/users", userRoutes);

const httpServer = serverSocket(app);   

const port = process.env.PORT || 5000;
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
});
httpServer.listen(port, () => console.log(`Server is running on the port ${port}`));
