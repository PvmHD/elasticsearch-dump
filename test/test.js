var elasticdump = require(__dirname + "/../elasticdump.js")
        .elasticdump;
var request = require('request');
var should = require('should');
var fs = require('fs');
var baseUrl = "http://127.0.0.1:9200";
var seeds = {};
var seedSize = 500;
var testTimeout = seedSize * 100;
var i = 0;
while (i < seedSize)
{
        seeds[i] = {
                key: ("key" + i)
        };
        i++;
}
var seed = function (index, callback)
{
        var started = 0;
        for (var key in seeds)
        {
                started++;
                var seed = seeds[key];
                seed['_uuid'] = key;
                var url = baseUrl + "/" + index + "/seeds/" + key;
                request.put(url,
                {
                        body: JSON.stringify(seed)
                }, function (err, response, body)
                {
                        started--;
                        if (started == 0)
                        {
                                request.post(baseUrl + "/" + index + "/_refresh", function (err,
                                        response)
                                {
                                        callback();
                                });
                        }
                });
        }
}
var clear = function (callback)
{
        request.del(baseUrl + '/destination_index', function (err, response, body)
        {
                request.del(baseUrl + '/source_index', function (err, response, body)
                {
                        request.del(baseUrl + '/another_index', function (err, response, body)
                        {
                                callback();
                        });
                });
        });
}
describe("ELASTICDUMP", function ()
{
        beforeEach(function (done)
        {
                this.timeout(testTimeout);
                clear(function ()
                {
                        seed("source_index", function ()
                        {
                                seed("another_index", function ()
                                {
                                        setTimeout(function ()
                                        {
                                                done();
                                        }, 500);
                                });
                        });
                });
        });
        it('can connect', function (done)
        {
                this.timeout(testTimeout);
                request(baseUrl, function (err, response, body)
                {
                        should.not.exist(err);
                        body = JSON.parse(body);
                        body.tagline.should.equal('You Know, for Search');
                        done();
                })
        });
        it('source_index starts filled', function (done)
        {
                this.timeout(testTimeout);
                var url = baseUrl + "/source_index/_search"
                request.get(url, function (err, response, body)
                {
                        body = JSON.parse(body);
                        body.hits.total.should.equal(seedSize);
                        done();
                });
        });
        it('destination_index starts non-existant', function (done)
        {
                this.timeout(testTimeout);
                var url = baseUrl + "/destination_index/_search"
                request.get(url, function (err, response, body)
                {
                        body = JSON.parse(body);
                        body.status.should.equal(404);
                        done();
                });
        });
        describe("es to es", function ()
        {
                it('works', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                input: baseUrl + '/source_index',
                                output: baseUrl + '/destination_index',
                                scrollTime: '10m'
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function ()
                        {
                                var url = baseUrl + "/destination_index/_search";
                                request.get(url, function (err, response, body)
                                {
                                        should.not.exist(err);
                                        body = JSON.parse(body);
                                        body.hits.total.should.equal(seedSize);
                                        done();
                                });
                        });
                });
                it('counts updates as writes', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                input: baseUrl + '/source_index',
                                output: baseUrl + '/destination_index',
                                scrollTime: '10m'
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function (total_writes)
                        {
                                var url = baseUrl + "/destination_index/_search";
                                request.get(url, function (err, response, body)
                                {
                                        should.not.exist(err);
                                        body = JSON.parse(body);
                                        body.hits.total.should.equal(seedSize);
                                        total_writes.should.equal(seedSize);
                                        dumper.dump(function (total_writes)
                                        {
                                                var url = baseUrl +
                                                        "/destination_index/_search";
                                                request.get(url,
                                                        function (err,
                                                                response,
                                                                body)
                                                        {
                                                                should.not
                                                                        .exist(
                                                                                err
                                                                );
                                                                body =
                                                                        JSON
                                                                        .parse(
                                                                                body
                                                                );
                                                                body.hits
                                                                        .total
                                                                        .should
                                                                        .equal(
                                                                                seedSize
                                                                );
                                                                total_writes
                                                                        .should
                                                                        .equal(
                                                                                seedSize
                                                                );
                                                                done();
                                                        });
                                        });
                                });
                        });
                });
                it('can also delete documents from the source index', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                delete: true,
                                input: baseUrl + '/source_index',
                                output: baseUrl + '/destination_index',
                                scrollTime: '10m'
                        }
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function ()
                        {
                                var url = baseUrl + "/destination_index/_search"
                                request.get(url, function (err, response,
                                        destination_body)
                                {
                                        destination_body = JSON.parse(
                                                destination_body);
                                        destination_body.hits.total.should.equal(
                                                seedSize);
                                        dumper.input.reindex(function ()
                                        {
                                                // Note: Depending on the speed of your ES server
                                                // all the elements might not be deleted when the HTTP response returns
                                                // sleeping is required, but the duration is based on your CPU, disk, etc.
                                                // lets guess 1ms per entry in the index
                                                setTimeout(function ()
                                                {
                                                        var url =
                                                                baseUrl +
                                                                "/source_index/_search"
                                                        request
                                                                .get(
                                                                        url,
                                                                        function (
                                                                                err,
                                                                                response,
                                                                                source_body
                                                                        )
                                                                        {
                                                                                source_body =
                                                                                        JSON
                                                                                        .parse(
                                                                                                source_body
                                                                                );
                                                                                source_body
                                                                                        .hits
                                                                                        .total
                                                                                        .should
                                                                                        .equal(
                                                                                                0
                                                                                );
                                                                                done();
                                                                        }
                                                        );
                                                }, 5 * seedSize);
                                        });
                                });
                        });
                });
        });
        describe("es to file", function ()
        {
                it('works', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                input: baseUrl + '/source_index',
                                output: '/tmp/out.json',
                                scrollTime: '10m'
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function ()
                        {
                                var raw = fs.readFileSync('/tmp/out.json');
                                var output = JSON.parse(raw);
                                output.length.should.equal(seedSize);
                                done();
                        });
                });
        });
        describe("file to es", function ()
        {
                it('works', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                input: '/tmp/out.json',
                                output: baseUrl + '/destination_index',
                                scrollTime: '10m'
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function ()
                        {
                                var url = baseUrl + "/destination_index/_search";
                                request.get(url, function (err, response, body)
                                {
                                        should.not.exist(err);
                                        body = JSON.parse(body);
                                        body.hits.total.should.equal(seedSize);
                                        done();
                                });
                        });
                });
        });
        describe("all es to file", function ()
        {
                it('works', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                input: baseUrl,
                                output: '/tmp/out.json',
                                scrollTime: '10m',
                                all: true
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        dumper.dump(function ()
                        {
                                var raw = fs.readFileSync('/tmp/out.json');
                                var output = JSON.parse(raw);
                                count = 0;
                                for (var i in output)
                                {
                                        var elem = output[i];
                                        if (elem['_index'] === 'source_index' || elem[
                                                '_index'] === 'another_index')
                                        {
                                                count++;
                                        }
                                }
                                count.should.equal(seedSize * 2);
                                done();
                        });
                });
        });
        describe("file to bulk es", function ()
        {
                it('works', function (done)
                {
                        this.timeout(testTimeout);
                        var options = {
                                limit: 100,
                                offset: 0,
                                debug: false,
                                output: baseUrl,
                                input: __dirname + '/seeds.json',
                                all: true,
                                bulk: true,
                                scrollTime: '10m'
                        };
                        var dumper = new elasticdump(options.input, options.output, options);
                        clear(function ()
                        {
                                dumper.dump(function ()
                                {
                                        request.get(baseUrl +
                                                "/source_index/_search",
                                                function (err, response, body1)
                                                {
                                                        request.get(baseUrl +
                                                                "/another_index/_search",
                                                                function (err,
                                                                        response,
                                                                        body2)
                                                                {
                                                                        body1 =
                                                                                JSON
                                                                                .parse(
                                                                                        body1
                                                                        );
                                                                        body2 =
                                                                                JSON
                                                                                .parse(
                                                                                        body2
                                                                        );
                                                                        body1.hits
                                                                                .total
                                                                                .should
                                                                                .equal(
                                                                                        5
                                                                        );
                                                                        body2.hits
                                                                                .total
                                                                                .should
                                                                                .equal(
                                                                                        5
                                                                        );
                                                                        done();
                                                                });
                                                });
                                });
                        });
                });
        });
        describe("es to stdout", function ()
        {
                it('works');
        });
        describe("stdin to es", function ()
        {
                it('works');
        });
});
