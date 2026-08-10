function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    if (data.token !== 'oee-fima-2026-secret') {
      return ContentService.createTextOutput(JSON.stringify({ok: false, error: 'Unauthorized'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }
    
    var action = data.action;
    var date = data.date;
    var shift = data.shift;
    var line = data.line;
    var stage = data.stage;
    
    var uniqueKey = date + '|S' + shift + '|L' + line + '|' + stage;
    
    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] == uniqueKey) {
        rowIndex = i + 1;
        break;
      }
    }
    
    var payloadStr = JSON.stringify(data.payload);
    var updatedAt = new Date().toISOString();
    
    var p = data.payload || {};
    var rowsList = p.rows || [];
    var ops = p.operators || {};
    var sum = p.summary || {};
    
    var masalahArr = [];
    var disposisiArr = [];
    var batchArr = [];
    var totalDT = 0;
    var totalGood = 0;
    var totalDefect = 0;
    
    rowsList.forEach(function(r){
      if(r.masalah) masalahArr.push(r.masalah);
      if(r.disposisi) disposisiArr.push(r.disposisi);
      if(r.batch) batchArr.push(r.batch + (r.wo ? ' (WO:'+r.wo+')' : ''));
      
      var gVal = parseFloat(String(r.good || '0').replace(',','.')) || 0;
      var dVal = parseFloat(String(r.defect || '0').replace(',','.')) || 0;
      totalGood += gVal;
      totalDefect += dVal;
      
      if(r.mulai && r.selesai) {
        var mParts = r.mulai.split(':');
        var sParts = r.selesai.split(':');
        if(mParts.length === 2 && sParts.length === 2) {
          var mMin = parseInt(mParts[0])*60 + parseInt(mParts[1]);
          var sMin = parseInt(sParts[0])*60 + parseInt(sParts[1]);
          var dur = (sMin - mMin + 1440) % 1440;
          if(['1','3','4','5','6','7','8','9'].indexOf(String(r.kode)) !== -1) {
            totalDT += dur;
          }
        }
      }
    });
    
    var ringkasanMasalah = masalahArr.join('; ');
    var penanggulangan = disposisiArr.join('; ');
    var produkBatch = Array.from(new Set(batchArr)).join(', ');
    
    var inisialList = [];
    for(var k=1; k<=6; k++){
      if(ops['op' + k]) inisialList.push(ops['op' + k].toUpperCase());
    }
    var inisialOperator = inisialList.join(', ');

    var availability = sum.availability || '0,00 %';
    var performance = sum.performance || '0,00 %';
    var quality = sum.quality || '0,00 %';
    var oee = sum.oee || '0,00%';
    
    var rowData = [
      uniqueKey, date, shift, line, stage, payloadStr, updatedAt, 1,
      availability, performance, quality, oee, totalDT,
      totalGood, totalDefect, ringkasanMasalah, penanggulangan, produkBatch, inisialOperator
    ];

    if (action === 'save') {
      if (rowIndex > -1) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ok: true, updatedAt: updatedAt}))
        .setMimeType(ContentService.MimeType.JSON);
        
    } else if (action === 'load') {
      if (rowIndex > -1) {
        var savedPayload = rows[rowIndex - 1][5];
        return ContentService.createTextOutput(JSON.stringify({ok: true, data: JSON.parse(savedPayload)}))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ok: true, data: null}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}