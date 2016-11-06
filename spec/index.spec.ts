/*
 * Copyright 2016 Stephane M. Catala
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * Limitations under the License.
 */
;
import getService from '../src'
import * as Promise from 'bluebird'

let cache: any
let getLiveKey: any
let getProxyKey: any
let openpgp: any
let livekey: any
let types: any

beforeEach(() => { // mock dependencies
  cache = jasmine.createSpyObj('cache', [ 'set', 'del', 'get', 'has' ])
  getLiveKey = jasmine.createSpy('getLiveKey')
  getProxyKey = jasmine.createSpy('getProxyKey')
  openpgp = {
    crypto: { hash: jasmine.createSpyObj('hash', [ 'sha256' ]) },
    key: jasmine.createSpyObj('key', [ 'readArmored', 'generateKey' ]),
    message: jasmine.createSpyObj('message', [ 'fromText', 'readArmored' ])
  }
  livekey = { key: {}, bp: { keys: [ { id: 'key-id' } ], user: { ids: [] } } }
})

describe('default export: getOpgpService (config?: OpgpServiceFactoryConfig): ' +
'OpgpService', () => {
  let opgpService: any
  beforeEach(() => {
    opgpService = jasmine.objectContaining({
      getKeysFromArmor: jasmine.any(Function),
      encrypt: jasmine.any(Function),
      decrypt: jasmine.any(Function),
      sign: jasmine.any(Function),
      verify: jasmine.any(Function)
    })
  })

  describe('when called without arguments', () => {
    let service: any
    beforeEach(() => {
      service = getService()
    })

    it('returns an {OpgpService} instance', () =>{
      expect(service).toEqual(opgpService)
    })
  })

  describe('when called with { cache?: CsrKeyCache<OpgpLiveKey>, ' +
  'getLiveKey?: LiveKeyFactory, getProxyKey?: ProxyKeyFactory, ' +
  'openpgp?: openpgp }', () => {
    let service: any
    beforeEach(() => {
      openpgp.key.readArmored.and.returnValue({ keys: [ livekey.key ] })
      getLiveKey.and.returnValue(livekey)
      cache.set.and.returnValue('key-handle')
    })

    beforeEach(() => {
      service = getService({
        cache: cache,
        getLiveKey: getLiveKey,
        getProxyKey: getProxyKey,
        openpgp: openpgp
      })
      service.getKeysFromArmor('key-armor')
    })

    it('returns an {OpgpService} instance based on the given dependencies ', () =>{
      expect(service).toEqual(opgpService)
      expect(openpgp.key.readArmored).toHaveBeenCalledWith('key-armor')
      expect(getLiveKey).toHaveBeenCalledWith(livekey.key)
      expect(cache.set).toHaveBeenCalledWith(livekey)
      expect(getProxyKey).toHaveBeenCalledWith('key-handle', livekey.bp)
    })
  })
})

describe('OpgpService', () => {
  let service: any
  beforeEach(() => {
    service = getService({
      cache: cache, // unit-tested separately
      getLiveKey: getLiveKey, // unit-tested separately
      // default getProxyKey
      openpgp: openpgp
    })
  })

  describe('getKeysFromArmor (armor: string, opts?: OpgpKeyringOpts)' +
  ': Promise<OpgpProxyKey[]|OpgpProxyKey>', () => {

    it('delegates to the openpgp primitive', () => {
      service.getKeysFromArmor('key-armor')
      expect(openpgp.key.readArmored).toHaveBeenCalledWith('key-armor')
    })

    describe('when the underlying openpgp primitive returns a single key', () => {
      let error: any
      let result: any
      beforeEach(() => {
        openpgp.key.readArmored.and.returnValue({ keys: [ livekey.key ] })
        getLiveKey.and.returnValue(livekey)
        cache.set.and.returnValue('key-handle')
      })

      beforeEach((done) => {
        service.getKeysFromArmor('key-armor')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('creates a new {OpgpLiveKey} instance from the openpgp key', () => {
        expect(getLiveKey).toHaveBeenCalledWith(livekey.key)
      })

      it('stores the new {OpgpLiveKey} instance in the underlying cache', () => {
        expect(cache.set).toHaveBeenCalledWith(livekey)
      })

      it('returns a Promise that resolves to a corresponding {OpgpProxyKey} instance',
      () => {
        expect(result).toEqual(jasmine.objectContaining({ handle: 'key-handle' }))
        expect(result).toEqual(jasmine.objectContaining(livekey.bp))
        expect(error).not.toBeDefined()
      })
    })

    describe('when the underlying openpgp primitive returns multiple keys', () => {
      let error: any
      let result: any
      beforeEach(() => {
        openpgp.key.readArmored.and.returnValue({ keys: [ livekey.key, livekey.key ] })
        getLiveKey.and.returnValue(livekey)
        cache.set.and.returnValue('key-handle') // would normally return unique values for each stored key
      })

      beforeEach((done) => {
        service.getKeysFromArmor('keys-armor')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('creates new {OpgpLiveKey} instances from each openpgp key', () => {
        expect(getLiveKey.calls.allArgs())
        .toEqual([ [ livekey.key ], [ livekey.key ] ])
      })

      it('stores the new {OpgpLiveKey} instances in the underlying cache', () => {
        expect(cache.set.calls.allArgs()).toEqual([ [ livekey ], [ livekey ] ])
      })

      it('returns a Promise that resolves to corresponding {OpgpProxyKey} instances',
      () => {
        expect(result).toEqual(jasmine.any(Array))
        expect(result.length).toBe(2)
        result.forEach((res: any) => {
          expect(res).toEqual(jasmine.objectContaining({ handle: 'key-handle' }))
          expect(res).toEqual(jasmine.objectContaining(livekey.bp))
        })
        expect(error).not.toBeDefined()
      })
    })

    describe('when the underlying openpgp primitive throws an error', () => {
      let error: any
      let result: any
      beforeEach(() => {
        openpgp.key.readArmored.and.throwError('boom')
      })

      beforeEach((done) => {
        service.getKeysFromArmor('key-armor')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('returns a Promise that rejects with the thrown error', () => {
        expect(error).toBeDefined()
        expect(error.message).toBe('boom')
        expect(result).not.toBeDefined()
      })
    })
  })

  describe('sign (keyRefs: KeyRef[]|KeyRef, text: string, opts?: SignOpts)' +
  ': Promise<string>', () => {
    let message: any
    beforeEach(() => {
      message = jasmine.createSpyObj('message', [ 'sign', 'armor' ])
    })

    describe('when given a text string and a valid handle string that is not stale',
    () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(livekey)
        openpgp.message.fromText.and.returnValue(message)
        message.sign.and.returnValue(message)
        message.armor.and.returnValue('signed-armor-text')
      })

      beforeEach((done) => {
        service.sign('valid-key-handle', 'plain text')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('retrieves the {OpgpLiveKey} instance referenced by the given handle',
      () => {
        expect(cache.get).toHaveBeenCalledWith('valid-key-handle')
      })

      it('delegates to the openpgp primitive', () => {
        expect(openpgp.message.fromText).toHaveBeenCalledWith('plain text')
        expect(message.sign).toHaveBeenCalledWith([ livekey ])
        expect(message.armor).toHaveBeenCalledWith()
      })

      it('returns a Promise that resolves to an armor string ' +
      'of the given text string ' +
      'signed with the referenced {OpgpLiveKey} instance ', () => {
        expect(result).toBe('signed-armor-text')
        expect(error).not.toBeDefined()
      })
    })

    describe('when given a text string and a stale handle string',
    () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(undefined)
      })

      beforeEach((done) => {
        service.sign('stale-key-handle', 'plain text')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('attempts to retrieve the {OpgpLiveKey} instance ' +
      'referenced by the given handle', () => {
        expect(cache.get).toHaveBeenCalledWith('stale-key-handle')
      })

      it('does not delegate to the openpgp primitive', () => {
        expect(openpgp.message.fromText).not.toHaveBeenCalled()
      })

      it('returns a Promise that rejects ' +
      'with an `invalid key reference: not a string or stale` {Error}', () => {
        expect(result).not.toBeDefined()
        expect(error).toBeDefined()
        expect(error.message).toBe('invalid key reference: not a string or stale')
      })
    })

    describe('when given non-compliant arguments', () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(livekey)
      })

      beforeEach((done) => {
        const args = getInvalidAuthArgs()
        Promise.any(args.map((args: any[]) => service.sign.apply(service, args)))
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('attempts to retrieve the {OpgpLiveKey} instances ' +
      'referenced by the given handles when compliant', () => {
        cache.get.calls.allArgs()
        .forEach((args: any) => expect(args).toEqual([ 'compliant handle' ]))
      })

      it('does not delegate to the openpgp primitive', () => {
        expect(openpgp.message.fromText).not.toHaveBeenCalled()
      })

      it('returns a Promise that rejects ' +
      'with an `invalid key reference: not a string or stale` or ' +
      'an `invalid text: not a string` {Error}', () => {
        expect(result).not.toBeDefined()
        expect(error).toEqual(jasmine.any(Promise.AggregateError))
        error.forEach((error: any) => {
          expect(error).toEqual(jasmine.any(Error))
          expect(error.message).toEqual(jasmine
          .stringMatching(/invalid key reference: not a string or stale|invalid text: not a string/))
        })
      })
    })
  })

  describe('verify (keyRefs: KeyRef[]|KeyRef, armor: string, opts?: VerifyOpts)' +
  ': Promise<string>', () => {
    let message: any
    beforeEach(() => {
      message = jasmine.createSpyObj('message', [ 'verify', 'getText' ])
    })

    describe('when given a signed armor text string and the valid handle string ' +
    'of the corresponding authentication key', () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(livekey)
        openpgp.message.readArmored.and.returnValue(message)
        message.verify.and.returnValue([ { keyid: 'keyid', valid: true }])
        message.getText.and.returnValue('plain-text')
      })

      beforeEach((done) => {
        service.verify('valid-auth-key-handle', 'signed armor text')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('retrieves the {OpgpLiveKey} instance referenced by the given handle',
      () => {
        expect(cache.get).toHaveBeenCalledWith('valid-auth-key-handle')
      })

      it('delegates to the openpgp primitive', () => {
        expect(openpgp.message.readArmored).toHaveBeenCalledWith('signed armor text')
        expect(message.verify).toHaveBeenCalledWith([ livekey ])
        expect(message.getText).toHaveBeenCalledWith()
      })

      it('returns a Promise that resolves to the plain text string', () => {
        expect(result).toBe('plain-text')
        expect(error).not.toBeDefined()
      })
    })

    describe('when given a signed armor text string and a stale handle string',
    () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(undefined)
      })

      beforeEach((done) => {
        service.verify('stale-key-handle', 'signed armor text')
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('attempts to retrieve the {OpgpLiveKey} instance ' +
      'referenced by the given handle', () => {
        expect(cache.get).toHaveBeenCalledWith('stale-key-handle')
      })

      it('does not delegate to the openpgp primitive', () => {
        expect(openpgp.message.readArmored).not.toHaveBeenCalled()
      })

      it('returns a Promise that rejects ' +
      'with an `invalid key reference: not a string or stale` {Error}', () => {
        expect(result).not.toBeDefined()
        expect(error).toBeDefined()
        expect(error.message).toBe('invalid key reference: not a string or stale')
      })
    })

    describe('when given non-compliant arguments', () => {
      let error: any
      let result: any
      beforeEach(() => {
        cache.get.and.returnValue(livekey)
      })

      beforeEach((done) => {
        const args = getInvalidAuthArgs()
        Promise.any(args.map((args: any[]) => service.verify.apply(service, args)))
        .then((res: any) => result = res)
        .catch((err: any) => error = err)
        .finally(() => setTimeout(done))
      })

      it('attempts to retrieve the {OpgpLiveKey} instances ' +
      'referenced by the given handles when compliant', () => {
        cache.get.calls.allArgs()
        .forEach((args: any) => expect(args).toEqual([ 'compliant handle' ]))
      })

      it('does not delegate to the openpgp primitive', () => {
        expect(openpgp.message.readArmored).not.toHaveBeenCalled()
      })

      it('returns a Promise that rejects ' +
      'with an `invalid key reference: not a string or stale` or ' +
      'an `invalid armor: not a string` {Error}', () => {
        expect(result).not.toBeDefined()
        expect(error).toEqual(jasmine.any(Promise.AggregateError))
        error.forEach((error: any) => {
          expect(error).toEqual(jasmine.any(Error))
          expect(error.message).toEqual(jasmine
          .stringMatching(/invalid key reference: not a string or stale|invalid armor: not a string/))
        })
      })
    })
  })
})

function getInvalidAuthArgs () {
  const types = [
    undefined,
    null,
    NaN,
    true,
    42,
    'foo',
    [ 'foo' ],
    { foo: 'foo' }
  ]

  function isString (val: any): val is String {
    return typeof val === 'string'
  }

  const nonStringTypes = types
  .filter((val: any) => !isString(val))

  return nonStringTypes
  .filter((val: any) => !Array.isArray(val))
  .map((invalidKeyRef: any) => [ invalidKeyRef, 'compliant text' ])
  .concat(nonStringTypes
    .map((invalidKeyRef: any) => [ [ invalidKeyRef ], 'compliant text' ]))
  .concat(nonStringTypes
    .map((invalidText: any) => [ 'compliant handle', invalidText ]))
}