//   GET    /api/v1/items       user    every item on my group's shelf, with the owner's nickname
//   GET    /api/v1/me/items    user    my own items
//   GET    /api/v1/items/:id   user    one item of my group, with the owner's nickname and language
//                                      (the item page shows the request in the OWNER's language),
//                                      my_loan_id if I already asked for it (else null), and
//                                      allowed_for_me (false: trusted neighbors only, and I'm not one yet)
//   POST   /api/v1/items       user    { item_key, max_days, spot, trusted_only? } → a new item on the shelf
//   PATCH  /api/v1/items/:id   owner   { trusted_only } → "trusted neighbors only" on or off
//   DELETE /api/v1/items/:id   owner   take it off the shelf (not while it is reserved or lent)

import express from 'express';
import { addItem, deleteItem, showItem, showMyItems, showShelf, updateItem } from './itemController.ts';
import { requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.get('/items', read(requireUser, showShelf));
router.get('/me/items', read(requireUser, showMyItems));
router.get('/items/:id', read(requireUser, showItem));
router.post('/items', write(requireUser, addItem));
router.patch('/items/:id', write(requireUser, updateItem));
router.delete('/items/:id', write(requireUser, deleteItem));

export default router;
