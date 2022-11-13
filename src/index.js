import express, { json } from 'express';
import { MongoClient } from 'mongodb';
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
        .then(() => res.sendStatus(409))
        .catch(register);
});

app.get('/participants', ({}, res) => {
    participants
        .find()
        .toArray()
        .then(participantsList => res.send(participantsList));
});

app.post('/messages', (req, res) => {
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().pattern(new RegExp('^message$|^private_message$'))
    });

    const {body} = req;

    const validation = messageSchema.validate(body, {abortEarly: true});

    if (validation.hasOwnProperty('error')) {
        res.sendStatus(422);
        return;
    }

    const {to, text, type} = body;
    const from = req.headers.User;

    const hour = dayjs().hour().toString().padStart(2, 0);
    const minute = dayjs().minute().toString().padStart(2, 0);
    const second = dayjs().second().toString().padStart(2, 0);

    messages
        .insertOne({from, to, text, type, time: `${hour}:${minute}:${second}`})
        .then(() => res.sendStatus(201));
});

app.get('/messages', (req, res) => {
    messages.find().toArray().then(fullMessagesList => {
        const {User} = req.headers;

        const dedicatedMessagesList = fullMessagesList.filter(
            ({from, to}) => from === User || [User, 'Todos'].includes(to)
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
    const name = req.headers.User;

    participants.findOne({name}).then(() => {
        participants.updateOne({name}, {$set: {lastStatus: Date.now()}});
        res.sendStatus(200);
    }).catch(() => res.sendStatus(404));
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

setInterval(listParticipants, 15000);

app.listen(5000, () => console.log('Running on port: https://localhost:5000'));