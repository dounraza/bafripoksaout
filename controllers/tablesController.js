const asyncHandler = require("express-async-handler");
const Table = require("../model/Table");
const serverSocket = require("../serverSocket");
const playerTablesMap = require("../game/playerTables");

exports.findAll = asyncHandler(async (req, res)=> {
    try {
        const tables = await Table.findAll();
        const tableIds = tables.map(t => t.id);
        const occupiedSeatsMap = serverSocket.getFreeSits(tableIds);
        
        const dataWithActiveInfo = tables.map(t => {
            const tableData = t.toJSON();
            // Ensure the gameType from the database is used
            tableData.gameType = t.gameType;
            return tableData;
        });

        for (const table of tables) {
          if (occupiedSeatsMap.get(table.id) === undefined) {
            occupiedSeatsMap.set(table.id, 0);
          }
        }
        
        const occupiedSeats = Object.fromEntries(occupiedSeatsMap);
        
        res.json({message: "all", data: dataWithActiveInfo, occupiedSeats});
    } catch (error) {
        console.error('[TABLES CONTROLLER ERROR]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });   
    }
});

exports.findById = asyncHandler(async (req, res)=> {
    try {
        const table = await Table.findByPk(req.params.id);
        if (!table) {
            return res.status(404).json({ message: 'Table not found' });
        }
        
        const tableData = table.get({ plain: true }); 
        
        // Ensure gameType is always present, taking priority from DB record
        if (!tableData.gameType) {
             tableData.gameType = 'poker'; // Default
        }
        
        const activeTable = serverSocket.findTable(String(table.id));
        if (activeTable) {
            // If active, use activeTable's type if available
            tableData.gameType = activeTable.tableInfo.gameType || tableData.gameType;
        }
        
        console.log(`[DEBUG] findById - Table ID: ${table.id}, Final gameType injected: ${tableData.gameType}`);
        
        res.json({message: "table", data: tableData});
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
