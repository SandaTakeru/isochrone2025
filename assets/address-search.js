// assets/address-search.js
// 住所検索機能（Nominatim API使用）

/**
 * 住所検索クラス
 * Nominatim（OpenStreetMapの逆ジオコード）を使用して住所から座標を取得
 */
class AddressSearch {
  constructor() {
    this.nominatimUrl = 'https://nominatim.openstreetmap.org/search';
    this.results = [];
    this.isSearching = false;
  }

  /**
   * 住所から座標を検索
   * @param {string} address - 検索する住所
   * @returns {Promise<Array>} 検索結果の配列
   */
  async searchAddress(address) {
    if (!address || address.trim().length === 0) {
      return [];
    }

    if (this.isSearching) {
      return [];
    }

    this.isSearching = true;
    
    try {
      const response = await fetch(`${this.nominatimUrl}?format=json&q=${encodeURIComponent(address)}&countrycodes=jp&limit=10`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RailIsochroneApp'
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      this.results = data || [];
      return this.results;
    } catch (error) {
      console.error('[AddressSearch] Error:', error);
      return [];
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * 検索結果から表示用のHTMLを生成
   * @param {Array} results - 検索結果の配列
   * @returns {string} HTML文字列
   */
  generateResultsHTML(results) {
    if (!results || results.length === 0) {
      return '<div style="padding: 12px; color: #999; text-align: center;">検索結果がありません</div>';
    }

    return results.map((result, index) => {
      const name = result.name || result.display_name;
      const displayName = result.display_name;
      
      // 表示用の短い名前を作成
      const shortDisplay = displayName.length > 50 
        ? displayName.substring(0, 50) + '...' 
        : displayName;

      return `
        <div class="addressResult" data-index="${index}">
          <span class="addressResultName">${escapeHtml(name)}</span>
          <span class="addressResultDetails">${escapeHtml(shortDisplay)}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * 検索結果を表示
   * @param {Array} results - 検索結果の配列
   * @param {HTMLElement} container - 結果を表示するコンテナ要素
   */
  displayResults(results, container) {
    if (!container) return;

    container.innerHTML = this.generateResultsHTML(results);
    
    if (results.length > 0) {
      container.style.display = 'block';
      
      // 各結果にクリックハンドラを設定
      container.querySelectorAll('.addressResult').forEach((el) => {
        el.addEventListener('click', () => {
          const index = parseInt(el.dataset.index, 10);
          const result = results[index];
          if (result) {
            // カスタムイベントを発火（呼び出し側で処理）
            container.dispatchEvent(new CustomEvent('addressSelected', {
              detail: {
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                name: result.name || result.display_name
              }
            }));
          }
        });
      });
    } else {
      container.style.display = 'none';
    }
  }

  /**
   * 結果をクリア
   */
  clear() {
    this.results = [];
    const container = document.getElementById('addressSearchResults');
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }
}

/**
 * HTML特殊文字をエスケープ
 * @param {string} text - エスケープ対象のテキスト
 * @returns {string} エスケープ済みテキスト
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 住所検索UI制御
 * 検索実行、結果表示を管理
 */
class AddressSearchUI {
  constructor() {
    this.addressSearch = new AddressSearch();
    this.init();
  }

  /**
   * UI要素の初期化
   */
  init() {
    this.setupAddressSearch();
  }

  /**
   * 住所検索機能の設定
   */
  setupAddressSearch() {
    const addressInput = document.getElementById('addressInput');
    const searchBtn = document.getElementById('addressSearchBtn');
    const resultsContainer = document.getElementById('addressSearchResults');

    if (!addressInput || !resultsContainer) {
      return;
    }

    // 検索ボタンのクリック（ボタンが存在する場合）
    if (searchBtn) {
      searchBtn.addEventListener('click', async () => {
        await this.performSearch();
      });
    }

    // Enterキーで検索
    addressInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.performSearch();
      }
    });

    // 結果選択時の処理
    resultsContainer.addEventListener('addressSelected', (e) => {
      const { lat, lon, name } = e.detail;
      this.handleAddressSelected(lat, lon, name);
    });
  }

  /**
   * 検索を実行
   */
  async performSearch() {
    const addressInput = document.getElementById('addressInput');
    const resultsContainer = document.getElementById('addressSearchResults');

    if (!addressInput) return;

    const address = addressInput.value.trim();
    if (!address) {
      return;
    }

    try {
      const results = await this.addressSearch.searchAddress(address);
      this.addressSearch.displayResults(results, resultsContainer);
    } catch (error) {
      console.error('[AddressSearch] Search error:', error);
    }
  }

  /**
   * 住所が選択された時の処理
   * @param {number} lat - 緯度
   * @param {number} lon - 経度
   * @param {string} name - 住所名
   */
  handleAddressSelected(lat, lon, name) {
    // 選択された住所を出発地として処理するカスタムイベントを発火
    document.dispatchEvent(new CustomEvent('addressLocationSelected', {
      detail: {
        lat: lat,
        lon: lon,
        name: name
      }
    }));

    // 検索フィールドをクリア
    const addressInput = document.getElementById('addressInput');
    if (addressInput) {
      addressInput.value = name;
    }

    // 結果を非表示に
    this.addressSearch.clear();
  }

  /**
   * 住所検索UIを外部から操作するメソッド
   */
  clear() {
    const addressInput = document.getElementById('addressInput');
    if (addressInput) {
      addressInput.value = '';
    }
    this.addressSearch.clear();
  }
}

// ページ読み込み時にUIを初期化
document.addEventListener('DOMContentLoaded', () => {
  window.addressSearchUI = new AddressSearchUI();
});
