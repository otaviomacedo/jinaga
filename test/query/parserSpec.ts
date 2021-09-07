import 'source-map-support/register';

import { expect } from 'chai';
import { describe, it } from 'mocha';

import { Jinaga } from '../../src/jinaga';
import { Query } from '../../src/query/query';
import { Condition, Preposition, Specification, ensure } from '../../src/query/query-parser';
import {JinagaServer} from "../../src";

describe('Query parser', () => {

    const j = new Jinaga(null, null, null);

    function tasksInList(l: List): Specification<Task> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: l
        });
    }

    function completionsInList(l: List): Specification<Completion> {
        l.type = 'List';
        return j.match({
            type: 'Completion',
            task: {
                type: 'Task',
                list: l
            }
        });
    }

    function listOfTask(t: Task): Specification<List> {
        ensure(t).has("list");
        t.type = 'Task';
        return j.match(t.list);
    }

    function listOfCompletion(c: Completion): Specification<List> {
        ensure(c).has("task").has("list");
        c.type = 'Completion';
        c.task.type = 'Task';
        return j.match(c.task.list);
    }

    function taskIsNotCompleted(t: Task): Condition<Completion> {
        return j.notExists({
            type: 'Completion',
            task: t
        });
    }

    function stillCompletedTasksInList(l: List) {
        return j.match({
            type: 'Task',
            list: l
        }).suchThat(taskIsStillCompleted);
    }

    function taskIsStillCompleted(t: Task) {
        return j.notExists({
            type: 'Completion',
            task: t
        }).suchThat(completionIsNotRevoked);
    }

    function completionIsNotRevoked(c: Completion) {
        return j.notExists({
            type: 'Revocation',
            completion: c
        });
    }

    function taskIsCompleted(t: Task): Condition<Completion> {
        return j.exists({
            type: 'Completion',
            task: t
        });
    }

    function uncompletedTasksInList(l: List): Specification<Completion> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: l
        }).suchThat(taskIsNotCompleted);
    }

    function completedTasksInList(l: List): Specification<Completion> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: l
        }).suchThat(taskIsCompleted);
    }

    function completedTasksInListWithArray(l: List): Specification<Task> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: <any>[l]
        }).suchThat(taskIsCompleted);
    }

    function uncompletedTasksInListAlt(l: List): Specification<Task> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: l
        }).suchThat(j.not(taskIsCompleted));
    }

    function completedTasksInListAlt(l: List): Specification<Task> {
        l.type = 'List';
        return j.match({
            type: 'Task',
            list: l
        }).suchThat(j.not(taskIsNotCompleted));
    }

    type List = { type: string };
    type Task = { type: string, list?: List };
    type Completion = { type: string, task?: Task };
    
    type S = {};
    type A = {};
    type B = {};
    
    function con1(a: A) {
        return j.exists({
            type: "B",
            y: a
        });
    }
    
    function con2(b: B) {
        return j.exists({
            type: "C",
            z: b
        });
    }

    function parseQuery<T, U>(preposition: Preposition<T, U>) {
        return new Query(preposition.steps);
    }
    
    it('should parse to a successor query', function () {
        const query = parseQuery(j.for(tasksInList));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task"');
    });

    it('should find two successors', function () {
        var query = parseQuery(j.for(completionsInList));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" S.task F.type="Completion"');
    });

    it('should find predecessor', function () {
        var query = parseQuery(j.for(listOfTask));
        expect(query.toDescriptiveString()).to.equal('F.type="Task" P.list');
    });

    it('should find two predecessors', function () {
        var query = parseQuery(j.for(listOfCompletion));
        expect(query.toDescriptiveString()).to.equal('F.type="Completion" P.task F.type="Task" P.list');
    });

    it('should parse a negative existential condition', function () {
        var query = parseQuery(j.for(uncompletedTasksInList));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" N(S.task F.type="Completion")');
    });

    it('should parse a positive existential condition', function () {
        var query = parseQuery(j.for(completedTasksInList));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" E(S.task F.type="Completion")');
    });

    it('should parse a negative outside of template function', function () {
        var query = parseQuery(j.for(uncompletedTasksInListAlt));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" N(S.task F.type="Completion")');
    });

    it('should parse a double negative', function () {
        var query = parseQuery(j.for(completedTasksInListAlt));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" E(S.task F.type="Completion")');
    });

    it('should chain to find siblings', function () {
        var query = parseQuery(j.for(listOfTask).then(uncompletedTasksInList));
        expect(query.toDescriptiveString()).to.equal('F.type="Task" P.list F.type="List" S.list F.type="Task" N(S.task F.type="Completion")');
    })

    it('should allow array with one predecessor', function () {
        var query = parseQuery(j.for(completedTasksInListWithArray));
        expect(query.toDescriptiveString()).to.equal('F.type="List" S.list F.type="Task" E(S.task F.type="Completion")');
    });

    it('should parse nested conditions', function() {
        const query = parseQuery(j.for(stillCompletedTasksInList));
        expect(query.toDescriptiveString()).to.equal('S.list F.type="Task" N(S.task F.type="Completion" N(S.completion F.type="Revocation"))');
    })

    it('should allow positive conjunction', () => {
        function conjoin(s: S) {
            return j.match({
                type: "A",
                x: s
            }).suchThat(con1).suchThat(con2);
        }

        var query = parseQuery(j.for(conjoin));
        expect(query.toDescriptiveString()).to.equal('S.x F.type="A" E(S.y F.type="B") E(S.z F.type="C")');
    });

    it('should allow positive with negative conjunction', () => {
        function conjoin(s: S) {
            return j.match({
                type: "A",
                x: s
            }).suchThat(con1).suchThat(j.not(con2));
        }

        var query = parseQuery(j.for(conjoin));
        expect(query.toDescriptiveString()).to.equal('S.x F.type="A" E(S.y F.type="B") N(S.z F.type="C")');
    });

    it('should allow negative conjunction', () => {
        function conjoin(s: S) {
            return j.match({
                type: "A",
                x: s
            }).suchThat(j.not(con1)).suchThat(j.not(con2));
        }

        var query = parseQuery(j.for(conjoin));
        expect(query.toDescriptiveString()).to.equal('S.x F.type="A" N(S.y F.type="B") N(S.z F.type="C")');
    });

    it('should allow condition', () => {
        function conjoin(s: S) {
            return j.match({
                type: "A",
                x: s
            }).suchThat(j.not(con1));
        }

        var query = parseQuery(j.for(conjoin));
        expect(query.toDescriptiveString()).to.equal('S.x F.type="A" N(S.y F.type="B")');
    });

    it('should parse nested predecessors', () => {
        function grandchildren(s: any) {
            return j.match({
                type: 'Child',
                parent: {
                    type: 'Parent',
                    grandparent: s
                }
            });
        }

        const query = parseQuery(j.for(grandchildren));
        expect(query.toDescriptiveString()).to.equal('S.grandparent F.type="Parent" S.parent F.type="Child"');
    });

    it('should parse consecutive existential conditions', () => {
        function ideaAbstractsInCompany(c: any) {
            return Jinaga.match({
                type: 'ImprovingU.Abstract',
                idea: {
                    type: 'ImprovingU.Idea',
                    semester: {
                        type: 'ImprovingU.Semester',
                        office: {
                            type: 'ImprovingU.Office',
                            company: c
                        }
                    }
                }
            }).suchThat(ideaAbstractIsCurrent).suchThat(ideaAbstractNotMigrated);
        }
        
        function ideaAbstractIsCurrent(next: any) {
            return Jinaga.notExists({
                type: 'ImprovingU.Abstract',
                prior: [next]
            });
        }
        
        function ideaAbstractNotMigrated(a: any) {
            return Jinaga.notExists({
                type: 'ImprovingU.Abstract.Migration',
                oldAbstract: a
            });
        }

        const query = parseQuery(j.for(ideaAbstractsInCompany));
        expect(query.toDescriptiveString()).to.equal(
            'S.company F.type="ImprovingU.Office" ' +
            'S.office F.type="ImprovingU.Semester" ' +
            'S.semester F.type="ImprovingU.Idea" ' +
            'S.idea F.type="ImprovingU.Abstract" ' +
            'N(S.prior F.type="ImprovingU.Abstract") ' +
            'N(S.oldAbstract F.type="ImprovingU.Abstract.Migration")'
        );
    });
});

it("Can query for posts by author", async () => {
    function postsByAuthor(author: any) {
        return j.match({
            type: "Blog.Post",
            author
        });
    }

    const pgConnection = process.env.JINAGA_POSTGRESQL ??
        'postgresql://postgres:postgres@localhost:5432/myapplication';
    const server = JinagaServer.create({
        pgKeystore: pgConnection,
        pgStore: pgConnection
    });

    const j = server.j;

    const person = await j.fact({
        type: "Jinaga.User",
        publicKey: "---Blog Creator---"
    });

    await j.fact({
        type: "Blog.Post",
        created: new Date('December 17, 1995 03:24:00'),
        author: person
    });


    const start = `{
        "type": "Jinaga.User",
        "publicKey": "---Blog Creator---"
    }`;

    const prep = `{
        "type": "Blog.Post",
        "author": "\${StartingPoint}"
    }`;




    let preposition = j.for(postsByAuthor);
    const posts = await j.query(person, preposition);

    console.log(posts);

    expect(posts.length).to.equal(1);
});