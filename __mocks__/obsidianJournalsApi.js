/* global module */

module.exports = {
  getJournalsApi(app) {
    return app?.plugins?.plugins?.journals?.api ?? null;
  }
};
