/**
 * fima-oee-sync Apps Script backend
 * - doGet: support ping only
 * - doPost: support load and save actions via JSON in e.postData.contents
 */

function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e){
  try{
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    if(action === 'ping'){
      return jsonResponse({ok:true,service:'fima-oee-sync',serverTime: new Date().toISOString()});
    }
    return jsonResponse({ok:false,error:'UNKNOWN_ACTION'});
  }catch(err){
    return jsonResponse({ok:false,error:'SERVER_ERROR',message: String(err && err.message)});
  }
}

function doPost(e){
  try{
    // Read raw contents (supports text/plain JSON)
    var raw = null;
    if(e && e.postData && e.postData.contents){
      raw = e.postData.contents;
    } else if(e && e.parameter && e.parameter.payload){
      raw = e.parameter.payload;
    }
    if(!raw){
      return jsonResponse({ok:false,error:'BAD_REQUEST'});
    }

    var req = null;
    try{ req = JSON.parse(raw); } catch(p){ return jsonResponse({ok:false,error:'BAD_REQUEST'}); }

    var serverToken = PropertiesService.getScriptProperties().getProperty('OEE_API_TOKEN');
    if(!serverToken){
      return jsonResponse({ok:false,error:'SERVER_TOKEN_MISSING'});
    }

    var action = req.action || '';

    if(action !== 'load' && action !== 'save'){
      return jsonResponse({ok:false,error:'UNKNOWN_ACTION'});
    }

    // Auth for load/save
    if(!req.token || String(req.token) !== String(serverToken)){
      return jsonResponse({ok:false,error:'UNAUTHORIZED'});
    }

    // Validate required fields
    var date = (req.date || '').toString();
    var shift = req.shift;
    var line = (req.line || '').toString();
    var stage = (req.stage || '').toString();

    if(!date || !shift || !line || !stage){
      return jsonResponse({ok:false,error:'BAD_REQUEST',message:'missing required fields'});
    }
    // Accept numeric 1/2/3 for shift
    var sNum = Number(shift);
    if([1,2,3].indexOf(sNum) === -1){
      return jsonResponse({ok:false,error:'BAD_REQUEST',message:'invalid shift'});
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if(!ss){
      // create a container spreadsheet if none bound (will live in user's Drive)
      ss = SpreadsheetApp.create('fima-oee-sync-data');
    }
    var sheet = ss.getSheetByName('Records');
    if(!sheet){
      sheet = ss.insertSheet('Records');
      var headers = ['key','date','shift','line','tahapan','payload','updatedAt','schemaVersion'];
      sheet.getRange(1,1,1,headers.length).setValues([headers]);
    }

    var key = date + '|S' + sNum + '|L' + line + '|' + stage;

    // find row by key (search column A)
    var lastRow = Math.max(sheet.getLastRow(),1);
    var data = [];
    if(lastRow >= 2){
      data = sheet.getRange(2,1,lastRow-1,1).getValues();
    }
    var foundRowIndex = -1;
    for(var i=0;i<data.length;i++){
      if(data[i] && data[i][0] === key){ foundRowIndex = i+2; break; }
    }

    if(action === 'load'){
      if(foundRowIndex !== -1){
        var payloadStr = sheet.getRange(foundRowIndex,6).getValue() || null;
        var parsed = null;
        try{ parsed = payloadStr ? JSON.parse(payloadStr) : null; }catch(e){ parsed = payloadStr; }
        return jsonResponse({ok:true,data: parsed});
      } else {
        return jsonResponse({ok:true,data: null});
      }
    }

    if(action === 'save'){
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try{
        var payload = req.payload || null;
        var payloadStr = (typeof payload === 'string') ? payload : JSON.stringify(payload || {});
        var updatedAt = new Date().toISOString();
        var schemaVersion = req.schemaVersion || '1';

        if(foundRowIndex !== -1){
          sheet.getRange(foundRowIndex,6).setValue(payloadStr);
          sheet.getRange(foundRowIndex,7).setValue(updatedAt);
          sheet.getRange(foundRowIndex,8).setValue(schemaVersion);
        } else {
          sheet.appendRow([key,date,sNum,line,stage,payloadStr,updatedAt,schemaVersion]);
        }
        return jsonResponse({ok:true,updatedAt:updatedAt});
      }finally{
        try{ lock.releaseLock(); }catch(e){}
      }
    }

    return jsonResponse({ok:false,error:'UNKNOWN_ACTION'});

  }catch(err){
    return jsonResponse({ok:false,error:'SERVER_ERROR',message:String(err && err.message)});
  }
}
