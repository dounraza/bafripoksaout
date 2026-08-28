const asyncHandler = require("express-async-handler");
const Table = require("../model/Table");
const serverSocket = require("../serverSocket");
const playerTablesMap = require("../game/playerTables");

exports.findAll = asyncHandler(async (req, res)=> {
    try {
        const tables = await Table.findAll();
        console.log("Résultat de la requête BDD :", tables);

        const tableIds = tables.map(t => t.id);
        const occupiedSeatsMap = serverSocket.getFreeSits(tableIds);
        
        const dataWithActiveInfo = tables.map(t => {
            const tableData = t.toJSON();
            const activeTable = serverSocket.findTable(String(t.id));
            if (activeTable) {
                tableData.activeGameType = activeTable.gameType;
                tableData.maxSeats = activeTable.maxSeats; // Ensure maxSeats is available
            } else {
                // Default max seats if not active
                tableData.maxSeats = 9; 
            }
            return tableData;
        });

        // Initialize all tables in occupiedSeatsMap if not present
        tables.forEach(t => {
            if (!occupiedSeatsMap.has(t.id)) {
                occupiedSeatsMap.set(t.id, 0); // 0 seats occupied
            }
        });
        
        const occupiedSeats = Object.fromEntries(occupiedSeatsMap);
        
        console.log('[DEBUG] Response data being sent:', { message: "all", data: dataWithActiveInfo, occupiedSeats });
        
        res.json({message: "all", data: dataWithActiveInfo, occupiedSeats});
    } catch (error) {
        console.error('[TABLES CONTROLLER ERROR]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });   
    }
});

exports.findById = asyncHandler(async (req, res)=> {
    try {
        const tables = await Table.findByPk(req.params.id);
        res.json({message: "table", data: tables});
    } catch (error) {
        console.error('[TABLES CONTROLLER ERROR]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });   
    }
});

exports.isUserInTable = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const playerTables = playerTablesMap.get(Number(userId));
        console.log('[USER IN TABLE] result', playerTablesMap);
        
        console.log('[USER IN TABLE] user id', userId);
        console.log('[USER IN TABLE] player table', playerTables);
        
        res.json(playerTables !== undefined && playerTables.length > 0);
    } catch (error) {
      console.error('[USER IN TABLE] ERR', error);
    }
})