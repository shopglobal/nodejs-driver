var assert = require('assert');
var async = require('async');
var util = require('util');

var helper = require('../../test-helper.js');
var Client = require('../../../lib/client.js');
var types = require('../../../lib/types.js');
var utils = require('../../../lib/utils.js');

describe('Client', function () {
  this.timeout(120000);
  describe('#execute(query, params, {prepared: 1}, callback)', function () {
    before(helper.ccmHelper.start(3));
    after(helper.ccmHelper.remove);
    it('should execute a prepared query with parameters on all hosts', function (done) {
      var client = newInstance();
      var query = 'SELECT * FROM system.schema_keyspaces where keyspace_name = ?';
      async.timesSeries(3, function (n, next) {
        client.execute(query, ['system'], {prepare: 1}, function (err, result) {
          assert.ifError(err);
          assert.strictEqual(client.hosts.length, 3);
          assert.notEqual(result, null);
          assert.notEqual(result.rows, null);
          next();
        });
      }, done);
    });
    it('should callback with error when query is invalid', function (done) {
      var client = newInstance();
      var query = 'SELECT WILL FAIL';
      client.execute(query, ['system'], {prepare: 1}, function (err, result) {
        assert.ok(err);
        assert.strictEqual(err.code, types.responseErrorCodes.syntaxError);
        done();
      });
    });
    it('should serialize all guessed types', function (done) {
      var values = [types.uuid(), 'as', '111', 1, new types.Long(0x1001, 0x0109AA), null, null, null, null, null, null, null, null];
      var columnNames = 'id, ascii_sample, text_sample, int_sample, bigint_sample, double_sample, blob_sample, boolean_sample, timestamp_sample, inet_sample, timeuuid_sample, list_sample, set_sample';

      serializationTest(values, columnNames, done);
    });
    it('should serialize all null values', function (done) {
      var values = [types.uuid(), null, null, null, null, null, null, null, null, null, null, null, null];
      var columnNames = 'id, ascii_sample, text_sample, int_sample, bigint_sample, double_sample, blob_sample, boolean_sample, timestamp_sample, inet_sample, timeuuid_sample, list_sample, set_sample';
      serializationTest(values, columnNames, done);
    });
  });
});

/**
 * @returns {Client}
 */
function newInstance() {
  return new Client(helper.baseOptions);
}

function serializationTest(values, columns, done) {
  var client = newInstance();
  var keyspace = helper.getRandomName('ks');
  var table = keyspace + '.' + helper.getRandomName('table');
  async.series([
    function (next) {
      client.execute(helper.createKeyspaceCql(keyspace, 3), helper.waitSchema(client, next));
    },
    function (next) {
      client.execute(helper.createTableCql(table), helper.waitSchema(client, next));
    },
    function (next) {
      var query = util.format('INSERT INTO %s ' +
        '(%s) VALUES ' +
        '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', table, columns);
      client.execute(query, values, {prepared: 1}, next);
    },
    function (next) {
      var query = util.format('SELECT %s FROM %s WHERE id = ?', columns, table);
      client.execute(query, [values[0]], {prepared: 1}, function (err, result) {
        assert.ifError(err);
        assert.ok(result);
        assert.ok(result.rows && result.rows.length > 0, 'There should be a row');
        var row = result.rows[0];
        for (var i = 0; i < values.length; i++) {
          helper.assertValueEqual(values[i], row.get(i));
        }
        next();
      });
    }
  ], done);
}