/* global module */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	testPathIgnorePatterns: ["/node_modules/", "<rootDir>/externals/"],
	moduleNameMapper: {
		"\\.css$": "<rootDir>/__mocks__/styleMock.js",
		"\\.md$": "<rootDir>/__mocks__/mdMock.js",
		"^obsidian-journals-api$": "<rootDir>/__mocks__/obsidianJournalsApi.js",
	},
};
