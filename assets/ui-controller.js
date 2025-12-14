// assets/ui-controller.js
// UI制御とイベントハンドリング

/**
 * UI制御クラス
 * モバイルメニュー、到達圏テーブル、都市選択などの UI 操作を管理
 */
class UIController {
  constructor() {
    this.currentSortColumn = 'cost_seconds';
    this.currentSortOrder = 'asc';
    this.allStationFeatures = [];
  }

  /**
   * モバイルメニューの初期化
   */
  initMobileMenu() {
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const controls = document.getElementById('controls');
    
    if(!menuToggleBtn || !controls) return;
    
    const toggleMenu = () => {
      menuToggleBtn.classList.toggle('active');
      controls.classList.toggle('open');
      document.body.classList.toggle('menuOpen');
    };
    
    const closeMenu = () => {
      menuToggleBtn.classList.remove('active');
      controls.classList.remove('open');
      document.body.classList.remove('menuOpen');
    };
    
    menuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    
    controls.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    document.addEventListener('click', (e) => {
      const isMenuClicked = menuToggleBtn.contains(e.target) || controls.contains(e.target);
      const isMenuOpen = controls.classList.contains('open');
      
      if(!isMenuClicked && isMenuOpen && window.innerWidth <= 900) {
        closeMenu();
      }
    }, true);
    
    window.addEventListener('resize', () => {
      if(window.innerWidth > 900) {
        menuToggleBtn.classList.remove('active');
        controls.classList.remove('open');
        document.body.classList.remove('menuOpen');
      }
    });
  }



  /**
   * 駅テーブルを表示・更新
   */
  displayStationTable(allIsochroneFeatures) {
    this.allStationFeatures = allIsochroneFeatures.slice();
    this.currentSortColumn = 'cost_seconds';
    this.currentSortOrder = 'asc';
    
    this.renderStationTable();
    this.setupHeaderClickHandlers();
  }

  /**
   * 駅テーブルをレンダリング
   */
  renderStationTable() {
    let sortedFeatures = this.allStationFeatures.slice();
    
    // ソート処理
    sortedFeatures.sort((a, b) => {
      let aVal, bVal;
      
      if(this.currentSortColumn === 'cost_seconds') {
        aVal = a.properties.cost_seconds;
        bVal = b.properties.cost_seconds;
      } else if(this.currentSortColumn === 'station_name') {
        aVal = a.properties.station_name || '駅';
        bVal = b.properties.station_name || '駅';
      } else if(this.currentSortColumn === 'company') {
        aVal = a.properties.company || '会社';
        bVal = b.properties.company || '会社';
      } else if(this.currentSortColumn === 'line') {
        aVal = a.properties.line || '線路';
        bVal = b.properties.line || '線路';
      }
      
      if(typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if(this.currentSortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
    
    const tableBody = id('stationTableBody');
    const stationTableDiv = id('stationTable');
    const totalCountEl = id('totalCount');
    
    if(!stationTableDiv || !tableBody) return;
    
    stationTableDiv.style.display = 'block';
    if(totalCountEl) totalCountEl.textContent = sortedFeatures.length;
    
    tableBody.innerHTML = '';
    for(let i = 0; i < sortedFeatures.length; i++) {
      const f = sortedFeatures[i];
      const costMinutes = Math.round(f.properties.cost_seconds / 60 * 10) / 10;
      const stationName = f.properties.station_name || '駅';
      const lineName = f.properties.line || '線路';
      const companyName = f.properties.company || '会社';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="border: 1px solid #ddd; padding: 6px; text-align: left;">${stationName}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: left;">${costMinutes}分</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 0.85em;">${companyName}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 0.85em;">${lineName}</td>
      `;
      
      tr.style.cursor = 'pointer';
      tr.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#e8e8e8';
      });
      tr.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '';
      });
      
      // 駅をクリックしたときのハンドラは呼び出し側で設定する
      tr.dataset.stationLon = f.geometry.coordinates[0];
      tr.dataset.stationLat = f.geometry.coordinates[1];
      tr.dataset.stationName = stationName;
      
      tableBody.appendChild(tr);
    }
  }

  /**
   * テーブルヘッダのクリックハンドラを設定
   */
  setupHeaderClickHandlers() {
    const headerStation = id('headerStation');
    const headerTime = id('headerTime');
    const headerCompany = id('headerCompany');
    const headerLine = id('headerLine');
    
    const headers = {
      'station_name': headerStation,
      'cost_seconds': headerTime,
      'company': headerCompany,
      'line': headerLine
    };
    
    for(const [columnName, headerEl] of Object.entries(headers)) {
      if(!headerEl) continue;
      
      headerEl.addEventListener('click', () => {
        if(this.currentSortColumn === columnName) {
          this.currentSortOrder = this.currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.currentSortColumn = columnName;
          this.currentSortOrder = 'asc';
        }
        
        this.renderStationTable();
        this.updateHeaderVisuals();
      });
    }
    
    this.updateHeaderVisuals();
  }

  /**
   * テーブルヘッダの表示状態を更新
   */
  updateHeaderVisuals() {
    const headers = {
      'station_name': id('headerStation'),
      'cost_seconds': id('headerTime'),
      'company': id('headerCompany'),
      'line': id('headerLine')
    };
    
    for(const [columnName, headerEl] of Object.entries(headers)) {
      if(!headerEl) continue;
      
      if(this.currentSortColumn === columnName) {
        const arrow = this.currentSortOrder === 'asc' ? ' ▲' : ' ▼';
        headerEl.textContent = headerEl.textContent.replace(/\s*[▲▼]\s*$/, '') + arrow;
        headerEl.style.backgroundColor = '#e0e0e0';
      } else {
        headerEl.textContent = headerEl.textContent.replace(/\s*[▲▼]\s*$/, '');
        headerEl.style.backgroundColor = '#f0f0f0';
      }
    }
  }

  /**
   * 駅テーブルをクリア
   */
  clearStationTable() {
    const stationTableDiv = id('stationTable');
    if(stationTableDiv) {
      stationTableDiv.style.display = 'none';
    }
    this.allStationFeatures = [];
  }

  /**
   * ロック・アンロックボタンの表示状態を更新
   */
  setLockButtonsVisibility(isLocked) {
    const lockBtn = id('lockBtn');
    const unlockBtn = id('unlockBtn');
    
    if(isLocked) {
      if(lockBtn) lockBtn.style.display = 'none';
      if(unlockBtn) unlockBtn.style.display = 'inline-block';
    } else {
      if(lockBtn) lockBtn.style.display = 'inline-block';
      if(unlockBtn) unlockBtn.style.display = 'none';
    }
  }

  /**
   * 駅テーブルの行にクリックイベントハンドラを設定
   */
  setStationTableRowClickHandler(callback) {
    const tableBody = id('stationTableBody');
    if(!tableBody) return;
    
    tableBody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if(!tr) return;
      
      const stationLon = parseFloat(tr.dataset.stationLon);
      const stationLat = parseFloat(tr.dataset.stationLat);
      const stationName = tr.dataset.stationName;
      
      callback(stationLon, stationLat, stationName);
    });
  }

  /**
   * すべての入力要素を無効にする（ローディング時）
   */
  disableAllInputs() {
    const citySelect = id('citySelect');
    const resetBtn = id('resetBtn');
    const lockBtn = id('lockBtn');
    const unlockBtn = id('unlockBtn');
    
    const elements = [citySelect, resetBtn, lockBtn, unlockBtn];
    elements.forEach(el => {
      if(el) {
        el.disabled = true;
        el.style.opacity = '0.6';
        el.style.cursor = 'not-allowed';
      }
    });
  }

  /**
   * すべての入力要素を有効にする（ローディング完了時）
   */
  enableAllInputs() {
    const citySelect = id('citySelect');
    const resetBtn = id('resetBtn');
    const lockBtn = id('lockBtn');
    const unlockBtn = id('unlockBtn');
    
    const elements = [citySelect, resetBtn, lockBtn, unlockBtn];
    elements.forEach(el => {
      if(el) {
        el.disabled = false;
        el.style.opacity = '1';
        el.style.cursor = 'pointer';
      }
    });
  }
}

// グローバルに UIController を公開
window.UIController = UIController;
