/* global module */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	moduleNameMapper: {
		"\\.css$": "<rootDir>/__mocks__/styleMock.js",
	},
};
