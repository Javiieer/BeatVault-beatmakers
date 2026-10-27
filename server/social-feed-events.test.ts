import type { ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeSocialFeedStreams, publishSocialFeedUpdate, publishSocialStoryUpdate, subscribeToSocialFeed } from './social-feed-events'

const response = () => ({ destroyed: false, writableEnded: false, write: vi.fn(), end: vi.fn() }) as unknown as ServerResponse

afterEach(closeSocialFeedStreams)

describe('social feed events', () => {
  it('broadcasts only a generic update signal and can omit the publishing account', () => {
    const authorStream = response()
    const viewerStream = response()
    subscribeToSocialFeed('author', authorStream)
    subscribeToSocialFeed('viewer', viewerStream)

    publishSocialFeedUpdate('author')

    expect(authorStream.write).not.toHaveBeenCalled()
    expect(viewerStream.write).toHaveBeenCalledWith('data: {"type":"new-posts"}\n\n')
  })

  it('caps concurrent streams per account and frees a slot when a stream closes', () => {
    const first = response()
    const second = response()
    const third = response()
    const release = subscribeToSocialFeed('account', first)

    expect(subscribeToSocialFeed('account', second)).toBeDefined()
    expect(subscribeToSocialFeed('account', third)).toBeUndefined()
    release?.()
    expect(subscribeToSocialFeed('account', third)).toBeDefined()
  })

  it('sends a data-free story signal to other connected accounts', () => {
    const authorStream = response()
    const viewerStream = response()
    subscribeToSocialFeed('author', authorStream)
    subscribeToSocialFeed('viewer', viewerStream)

    publishSocialStoryUpdate('author')

    expect(authorStream.write).not.toHaveBeenCalled()
    expect(viewerStream.write).toHaveBeenCalledWith('data: {"type":"new-stories"}\n\n')
  })

  it('limits story signals to the selected audience when the audience is not public', () => {
    const authorStream = response()
    const friendStream = response()
    const outsiderStream = response()
    subscribeToSocialFeed('author', authorStream)
    subscribeToSocialFeed('friend', friendStream)
    subscribeToSocialFeed('outsider', outsiderStream)

    publishSocialStoryUpdate('author', ['friend'])

    expect(authorStream.write).not.toHaveBeenCalled()
    expect(friendStream.write).toHaveBeenCalledWith('data: {"type":"new-stories"}\n\n')
    expect(outsiderStream.write).not.toHaveBeenCalled()
  })

  it('closes active streams during shutdown and skips ended connections', () => {
    const active = response()
    const ended = { destroyed: false, writableEnded: true, write: vi.fn(), end: vi.fn() } as unknown as ServerResponse
    subscribeToSocialFeed('active', active)
    subscribeToSocialFeed('ended', ended)

    publishSocialFeedUpdate()
    closeSocialFeedStreams()

    expect(active.write).toHaveBeenCalledOnce()
    expect(active.end).toHaveBeenCalledOnce()
    expect(ended.write).not.toHaveBeenCalled()
    expect(ended.end).toHaveBeenCalledOnce()
  })
})
