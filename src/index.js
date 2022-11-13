import express, { json } from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import joi from 'joi';

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let participants;
let messages;

mongoClient.connect().then(() => {
    const db = mongoClient.db('API_Bate-papo_OUL');
    participants = db.collection('participants');
    messages = db.collection('messages');
});

app.post('/participants', (req, res) => {
    const bodySchema = joi.object({name: joi.string().required()});

    const {body} = req;

    const validation = bodySchema.validate(body, {abortEarly: true});

    if (validation.hasOwnProperty('error')) {
        res.sendStatus(422);
        return;
    }

    const {name} = body;

    function register() {
        participants.insertOne({name, lastStatus: Date.now()});
    
        const hour = dayjs().hour().toString().padStart(2, 0);
        const minute = dayjs().minute().toString().padStart(2, 0);
        const second = dayjs().second().toString().padStart(2, 0);
    
        const systemMessage = {
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: `${hour}:${minute}:${second}`
        }
    
        messages.insertOne(systemMessage);

        res.sendStatus(201);
    }

    participants
        .findOne({name})
        .then(response => response === null ? register() : res.sendStatus(409));
});

app.get('/participants', ({}, res) => {
    participants
        .find()
        .toArray()
        .then(participantsList => res.send(participantsList));
});

const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().pattern(new RegExp('^message$|^private_message$'))
});

app.post('/messages', (req, res) => {
    const {body} = req;

    const validation = messageSchema.validate(body, {abortEarly: true});

    if (validation.hasOwnProperty('error')) {
        res.sendStatus(422);
        return;
    }
    const from = req.headers.user;

    function saveMessage() {
        const {to, text, type} = body;

        const hour = dayjs().hour().toString().padStart(2, 0);
        const minute = dayjs().minute().toString().padStart(2, 0);
        const second = dayjs().second().toString().padStart(2, 0);
    
        messages
            .insertOne({from, to, text, type, time: `${hour}:${minute}:${second}`})
            .then(() => res.sendStatus(201));
    }

    participants
        .findOne({name: from})
        .then(response => response === null ? res.sendStatus(422) : saveMessage());
});

app.get('/messages', (req, res) => {
    messages.find().toArray().then(fullMessagesList => {
        const {user} = req.headers;

        const dedicatedMessagesList = fullMessagesList.filter(
            ({from, to}) => from === user || [user, 'Todos'].includes(to)
        );
    
        res.send(
            req.query.hasOwnProperty('limit') ? (
                dedicatedMessagesList.slice(-req.query.limit)
            ) : (
                dedicatedMessagesList
            )
        );
    });
});

app.post('/status', (req, res) => {
    const name = req.headers.user;

    participants.findOne({name}).then(response => {
        if (response === null) {
            res.sendStatus(404);
        } else {
            participants.updateOne({name}, {$set: {lastStatus: Date.now()}});
            res.sendStatus(200);
        }
    });
});

function removalIdle(list) {
    for (const user of list) {
        if (Date.now() - user.lastStatus > 10000) {
            const hour = dayjs().hour().toString().padStart(2, 0);
            const minute = dayjs().minute().toString().padStart(2, 0);
            const second = dayjs().second().toString().padStart(2, 0);

            participants.deleteOne(user);
            messages.insertOne({
                from: user.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: `${hour}:${minute}:${second}`
            });
        }
    }
}

function listParticipants() {
    participants
        .find()
        .toArray()
        .then(removalIdle);
}

app.delete('/messages/:id', (req, res) => {
    const {id} = req.params;

    if (id.length !== 24) {
        res.sendStatus(404);
        return;
    }

    for (const hexCharacter of id) {
        if (hexCharacter < '0' || hexCharacter > 'f') {
            res.sendStatus(404);
            return;
        }
    }

    messages.findOne({_id: new ObjectId(id)}).then(response => {
        if (response === null) {
            res.sendStatus(404);
            return;
        }
        
        if (response.from !== req.headers.user) {
            res.sendStatus(401);
            return;
        }

        messages.deleteOne({_id: new ObjectId(id)}).then(() => res.sendStatus(200));
    })
});

app.put('/messages/:id', (req, res) => {
    const {body} = req;

    const validation = messageSchema.validate(body, {abortEarly: true});

    if (validation.hasOwnProperty('error')) {
        res.sendStatus(422);
        return;
    }

    const {id} = req.params;

    if (id.length !== 24) {
        res.sendStatus(404);
        return;
    }

    for (const hexCharacter of id) {
        if (hexCharacter < '0' || hexCharacter > 'f') {
            res.sendStatus(404);
            return;
        }
    }

    const name = req.headers.user;

    function checkId() {
        messages.findOne({_id: new ObjectId(id)}).then(response => {
            if (response === null) {
                res.sendStatus(404);
                return;
            }

            if (response.from !== name) {
                res.sendStatus(401);
                return;
            }

            messages
                .updateOne({_id: new ObjectId(id)}, {$set: body})
                .then(() => res.sendStatus(200));
        });
    }

    participants.findOne({name}).then(response => {
        response === null ? res.sendStatus(422) : checkId()
    });
});

setInterval(listParticipants, 15000);

app.listen(5000, () => console.log('Running on port: http://localhost:5000'));