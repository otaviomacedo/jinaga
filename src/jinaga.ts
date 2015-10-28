import Interface = require("./interface");
import Query = Interface.Query;
import StorageProvider = Interface.StorageProvider;
import StorageConnection = Interface.StorageConnection;
import NetworkProvider = Interface.NetworkProvider;
import Proxy = Interface.Proxy;
import Coordinator = Interface.Coordinator;
import parse = require("./queryParser");
import MemoryProvider = require("./memory");
import QueryInverter = require("./queryInverter");
import Inverse = QueryInverter.Inverse;
import Debug = require("debug");
import Collections = require("./collections");
import _isEqual = Collections._isEqual;
import _some = Collections._some;
import Tasks = require("./tasks");
import Task = Tasks.Task;
import TaskQueue = Tasks.TaskQueue;

var debug: (string) => void = Debug ? Debug("jinaga") : function() {};

class Watch {
    constructor(
        public start: Object,
        public joins: Query,
        public resultAdded: (message: Object) => void,
        public resultRemoved: (message: Object) => void,
        public inverses: Array<Inverse>) {
    }
}

class JinagaCoordinator implements Coordinator {
    private watches: Array<Watch> = [];
    private messages: StorageProvider = null;
    private network: NetworkProvider = null;

    save(storage: StorageProvider) {
        this.messages = storage;
        this.messages.init(this);
        if (this.network)
            this.messages.sendAllFacts();
    }

    sync(network: NetworkProvider) {
        this.network = network;
        this.network.init(this);
        this.messages.sendAllFacts();
    }

    fact(message: Object) {
        this.messages.save(message, null);
    }

    watch(
        start: Object,
        templates: Array<(target: Proxy) => Object>,
        resultAdded: (result: Object) => void,
        resultRemoved: (result: Object) => void) : Watch {

        var watch: Watch = null;
        var query = parse(templates);
        var inverses = QueryInverter.invertQuery(query);
        if (inverses.length > 0) {
            watch = new Watch(
                start,
                query,
                resultAdded,
                resultRemoved,
                inverses);
            this.watches.push(watch);
        }

        this.messages.open((connection: StorageConnection) => {
            connection.executeQuery(start, query, (error, results) => {
                results.forEach(resultAdded);
            });
        });

        if (this.network) {
            this.network.watch(start, query);
        }
        return watch;
    }

    removeWatch(watch: Watch) {
        for (var index = 0; index < this.watches.length; ++index) {
            if (this.watches[index] === watch) {
                this.watches.splice(index, 1);
                return;
            }
        }
    }

    private execute(
        connection: StorageConnection,
        fact: Object,
        query: Query,
        handler: (result: Array<Object>) => void): Task {

        var task = new Task();
        if (query && handler) {
            connection.executeQuery(fact, query, (error: string, result: Array<Object>) => {
                if (!error) {
                    handler(result);
                }
                task.done();
            });
        }
        else {
            task.done();
        }
        return task;
    }

    onSaved(fact: Object, source: any) {
        if (source === null) {
            this.messages.push(fact);
        }
        this.messages.open((connection: StorageConnection) => {
            var tasks = new TaskQueue();
            this.watches.forEach((watch: Watch) => {
                watch.inverses.forEach((inverse: Inverse) => {
                    tasks.push(this.execute(connection, fact, inverse.affected, (affected: Array<Object>) => {
                        if (_some(affected, (obj: Object) => _isEqual(obj, watch.start))) {
                            if (inverse.added && watch.resultAdded) {
                                tasks.push(this.execute(connection, fact, inverse.added, (added: Array<Object>) => {
                                    added.forEach(watch.resultAdded);
                                }));
                            }
                            if (inverse.removed && watch.resultRemoved) {
                                tasks.push(this.execute(connection, fact, inverse.removed, (removed: Array<Object>) => {
                                    removed.forEach(watch.resultRemoved);
                                }));
                            }
                        }
                    }));
                }, this);
            }, this);
            tasks.whenFinished(() => { connection.close(); });
        });
    }

    onReceived(fact: Object, source: any) {
        this.messages.save(fact, source);
    }

    onError(err: string) {
        debug(err);
    }

    send(fact: Object, source: any) {
        if (this.network)
            this.network.fact(fact);
    }
}

class WatchProxy {
    constructor(
        private coordinator: JinagaCoordinator,
        private watch: Watch
    ) { }

    public stop() {
        if (this.watch)
            this.coordinator.removeWatch(this.watch);
    }
}

class Jinaga {
    private coordinator: JinagaCoordinator;

    constructor() {
        this.coordinator = new JinagaCoordinator();
        this.coordinator.save(new MemoryProvider());
    }

    public save(storage: StorageProvider) {
        this.coordinator.save(storage);
    }
    public sync(network: NetworkProvider) {
        this.coordinator.sync(network);
    }
    public fact(message: Object) {
        this.coordinator.fact(JSON.parse(JSON.stringify(message)));
    }
    public watch(
        start: Object,
        templates: Array<(target: Proxy) => Object>,
        resultAdded: (result: Object) => void,
        resultRemoved: (result: Object) => void) : WatchProxy {
        var watch = this.coordinator.watch(JSON.parse(JSON.stringify(start)), templates, resultAdded, resultRemoved);
        return new WatchProxy(this.coordinator, watch);
    }

    public where(
        specification: Object,
        conditions: Array<(target: Proxy) => Object>
    ) {
        return new Interface.ConditionalSpecification(specification, conditions, true);
    }

    public not(condition: (target: Proxy) => Object): (target: Proxy) => Object;
    public not(specification: Object): Object;
    public not(conditionOrSpecification: any): any {
        if (typeof(conditionOrSpecification) === "function") {
            var condition = <(target: Proxy) => Object>conditionOrSpecification;
            return (t: Proxy) => new Interface.InverseSpecification(condition(t));
        }
        else {
            var specification = <Object>conditionOrSpecification;
            return new Interface.InverseSpecification(specification);
        }
    }
}

export = Jinaga;
