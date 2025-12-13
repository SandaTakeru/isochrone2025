// assets/loading-manager.js
// ローディング状態の管理と UI 制御

/**
 * ローディングマネージャー
 * サイトアクセス時や各種処理実行時のローディング状態を管理
 * ユーザーインタラクションの有効/無効を制御
 */
class LoadingManager {
  constructor() {
    this.isLoading = false;
    this.loadingOverlay = null;
    this.loadingText = null;
    this.loadingProgressBar = null;
    this.progressValue = 0;
    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingText = document.getElementById('loadingText');
    this.loadingProgressBar = document.getElementById('loadingProgressBar');
  }

  /**
   * ローディング開始
   * @param {string} text - 表示テキスト（デフォルト: "読み込み中..."）
   */
  start(text = '読み込み中...') {
    if (!this.loadingOverlay) {
      console.warn('[LoadingManager] Loading overlay element not found');
      return;
    }

    this.isLoading = true;
    this.progressValue = 0;
    document.body.classList.add('loading');
    
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove('hidden');
    }
    
    this.setText(text);
    this.setProgress(0);
    
    // 他の UI 要素の入力を無効にする
    this.disableAllInputs();

    if (window.AppConfig?.debug.enabled) {
      console.log('[LoadingManager] Loading started:', text);
    }
  }

  /**
   * ローディング終了
   * @param {number} delay - 終了前の遅延時間（ミリ秒）
   */
  async end(delay = 300) {
    if (!this.isLoading) return;

    // 最後の進捗を 100% に設定
    this.setProgress(100);

    // 遅延後に非表示にする
    await new Promise(resolve => setTimeout(resolve, delay));

    this.isLoading = false;
    document.body.classList.remove('loading');
    
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('hidden');
    }

    // 入力を再度有効にする
    this.enableAllInputs();

    if (window.AppConfig?.debug.enabled) {
      console.log('[LoadingManager] Loading ended');
    }
  }

  /**
   * ローディングテキストを更新
   * @param {string} text - 新しいテキスト
   */
  setText(text) {
    if (this.loadingText) {
      this.loadingText.textContent = text;
    }
  }

  /**
   * プログレスバーを更新
   * @param {number} percent - 進捗割合（0-100）
   */
  setProgress(percent) {
    if (this.loadingProgressBar) {
      this.progressValue = Math.min(Math.max(percent, 0), 100);
      this.loadingProgressBar.style.width = this.progressValue + '%';
    }
  }

  /**
   * プログレスバーを進める
   * @param {number} increment - 増加量
   */
  incrementProgress(increment) {
    this.setProgress(this.progressValue + increment);
  }

  /**
   * 全ての入力要素を無効にする
   */
  disableAllInputs() {
    const inputs = document.querySelectorAll(
      'button, input, select, textarea, [role="button"]'
    );
    inputs.forEach(el => {
      el.disabled = true;
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-disabled', 'true');
    });

    // マップのクリックイベントを無効にする
    if (window.map) {
      window.map.dragPan.disable();
      window.map.dragRotate.disable();
      window.map.keyboard.disable();
      window.map.doubleClickZoom.disable();
      window.map.scrollZoom.disable();
      window.map.touchZoomRotate.disable();
    }
  }

  /**
   * 全ての入力要素を有効にする
   */
  enableAllInputs() {
    const inputs = document.querySelectorAll(
      'button, input, select, textarea, [role="button"]'
    );
    inputs.forEach(el => {
      el.disabled = false;
      el.style.pointerEvents = '';
      el.setAttribute('aria-disabled', 'false');
    });

    // マップのイベントを再度有効にする
    if (window.map) {
      window.map.dragPan.enable();
      window.map.dragRotate.enable();
      window.map.keyboard.enable();
      window.map.doubleClickZoom.enable();
      window.map.scrollZoom.enable();
      window.map.touchZoomRotate.enable();
    }
  }

  /**
   * ローディング中かどうかを確認
   * @returns {boolean}
   */
  getIsLoading() {
    return this.isLoading;
  }
}

// グローバルに LoadingManager を公開
window.LoadingManager = LoadingManager;

// インスタンスを作成（即座に初期化）
window.loadingManager = new LoadingManager();
