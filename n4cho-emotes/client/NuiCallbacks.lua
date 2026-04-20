local isMenuOpen = false

local function canPlayerEmote()
    local ped = PlayerPedId()
    if IsEntityDead(ped) then
        return false, Translate('dead')
    end
    if (IsPedSwimming(ped) or IsPedSwimmingUnderWater(ped)) and not Config.AllowInWater then
        return false, Translate('swimming')
    end
    return true
end

function GetEmoteDataList(type)
    local list = {}
    if type == "walks" then
        for name, data in pairs(WalkData) do
            if Config.WalkingStylesEnabled then
                list[#list+1] = { name = name, label = data.label or name, type = 'Walks' }
            end
        end
    elseif type == "expressions" then
        for name, data in pairs(ExpressionData) do
            if Config.ExpressionsEnabled then
                list[#list+1] = { name = name, label = data.label or name, type = 'Expressions' }
            end
        end
    elseif type == "shared" then
        for name, data in pairs(SharedEmoteData) do
            if Config.SharedEmotesEnabled then
                list[#list+1] = { name = name, label = data.label or name, type = 'Shared' }
            end
        end
    elseif type == "emotes" then
        for name, data in pairs(EmoteData) do
            -- Check model compatibility 
            if CachedPlayerModel and not IsModelCompatible(CachedPlayerModel, name) then goto skip end
            
            local hasPermission = HasEmotePermission(name, data.emoteType)
            if not hasPermission then goto skip end

            local mappedType = 'Emotes'
            if data.emoteType == EmoteType.DANCES then mappedType = 'Dances'
            elseif data.emoteType == EmoteType.PROP_EMOTES then mappedType = 'Prop Emotes'
            elseif data.emoteType == EmoteType.ANIMAL_EMOTES or name:sub(1,4) == 'bdog' or name:sub(1,4) == 'sdog' or name:sub(1,3) == 'cat' or name:sub(1,3) == 'coy' then 
                if not Config.AnimalEmotesEnabled then goto skip end
                mappedType = 'Animal Emotes'
            end
            
            list[#list+1] = { name = name, label = data.label or name, type = mappedType }
            ::skip::
        end
    end
    
    table.sort(list, function(a, b) return (a.label or "") < (b.label or "") end)
    return list
end

function GetKeybindData()
    local binds = {}
    if Config.Keybinding then
        for i = 1, #Config.KeybindKeys do
            local emoteData = GetResourceKvpString(string.format('%s_bind_%s', Config.keybindKVP, i))
            if emoteData and emoteData ~= "" then
                emoteData = json.decode(emoteData)
            end
            binds[#binds+1] = {
                slot = i,
                label = emoteData and emoteData.label or "Empty Slot",
                name = emoteData and emoteData.emoteName or "",
                type = emoteData and emoteData.emoteType or "",
                keyLabel = GetKeyForCommand("emoteSelect"..i) or tostring(i)
            }
            -- Filter animal keybinds if disabled
            if not Config.AnimalEmotesEnabled then
                local b = binds[#binds]
                if b.type == EmoteType.ANIMAL_EMOTES or b.name:sub(1,4) == 'bdog' or b.name:sub(1,4) == 'sdog' or b.name:sub(1,3) == 'cat' or b.name:sub(1,3) == 'coy' then
                    binds[#binds].label = "Disabled Slot"
                    binds[#binds].name = ""
                    binds[#binds].type = ""
                end
            end
        end
    end
    return binds
end

function GetFavoritesData()
    local favs = {}
    local favoriteEmotes = GetFavoriteEmotes()
    local favoriteEmotesMap = GetFavoriteEmotesMap()
    for _, key in pairs(favoriteEmotesMap) do
        local data = favoriteEmotes[key]
        if data then
            -- Filter animal favorites if disabled
            local isAnimal = data.emoteType == EmoteType.ANIMAL_EMOTES or data.name:sub(1,4) == 'bdog' or data.name:sub(1,4) == 'sdog' or data.name:sub(1,3) == 'cat' or data.name:sub(1,3) == 'coy'
            if Config.AnimalEmotesEnabled or not isAnimal then
                favs[#favs+1] = { name = data.name, label = data.label or data.name, type = data.emoteType }
            end
        end
    end
    return favs
end

function BuildPayload()
    local emotesRaw = GetEmoteDataList("emotes")
    local emotes = {}
    local dances = {}
    local props = {}
    local animals = {}
    
    for _, e in ipairs(emotesRaw) do
        if e.type == 'Emotes' then table.insert(emotes, e)
        elseif e.type == 'Dances' then table.insert(dances, e)
        elseif e.type == 'Prop Emotes' then table.insert(props, e)
        elseif e.type == 'Animal Emotes' then table.insert(animals, e)
        end
    end

    return {
        emotes = emotes,
        dances = dances,
        props = props,
        animals = animals,
        walks = GetEmoteDataList("walks"),
        expressions = GetEmoteDataList("expressions"),
        shared = GetEmoteDataList("shared"),
        favorites = GetFavoritesData(),
        keybinds = GetKeybindData(),
        menuPosition = Config.MenuPosition,
        menuColor = Config.MenuColor,
        previewEnabled = PreviewEnabled,
        sharedEmotesEnabled = Config.SharedEmotesEnabled,
        previewPedEnabled = Config.PreviewPed
    }
end

-- Hook into OpenEmoteMenu from EmoteMenu.lua
-- We will replace the one in EmoteMenu.lua by overwriting it here since it's global
local oldOpenEmoteMenu = OpenEmoteMenu
function OpenEmoteMenu()
    local canEmote, errorMsg = canPlayerEmote()
    if not canEmote then
        TriggerEvent('chat:addMessage', { color = {255, 0, 0}, multiline = true, args = {"RPEmotes", errorMsg} })
        return
    end

    local placementState = GetPlacementState()
    if placementState == PlacementState.PREVIEWING or placementState == PlacementState.WALKING then return end

    if isMenuOpen then
        CloseNuiMenu()
    else
        isMenuOpen = true
        SetNuiFocus(true, true)
        
        -- Only show the ped if preview is enabled
        if PreviewEnabled then
            ShowPedMenu()
        end

        SendNUIMessage({
            action = 'openMenu',
            payload = BuildPayload()
        })
    end
end

function CloseNuiMenu()
    isMenuOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'closeMenu' })
    ClosePedMenu()
end

RegisterNUICallback('closeMenu', function(data, cb)
    CloseNuiMenu()
    if cb then cb('ok') end
end)

RegisterNUICallback('cancelEmote', function(data, cb)
    EmoteCancel()
    DestroyAllProps()
    if cb then cb('ok') end
end)

RegisterNUICallback('resetWalk', function(data, cb)
    ResetWalk()
    DeleteResourceKvp("walkstyle")
    if cb then cb('ok') end
end)

RegisterNUICallback('playEmote', function(data, cb)
    local name = data.name
    local strType = data.type
    
    -- Map string representation from JS back to EmoteType enum constants used in Lua
    local eType = EmoteType.EMOTES
    if strType == 'Dances' then eType = EmoteType.DANCES
    elseif strType == 'Prop Emotes' then eType = EmoteType.PROP_EMOTES
    elseif strType == 'Animal Emotes' then eType = EmoteType.ANIMAL_EMOTES
    elseif strType == 'Walks' then eType = EmoteType.WALKS
    elseif strType == 'Expressions' then eType = EmoteType.EXPRESSIONS
    elseif strType == 'Shared' then eType = EmoteType.SHARED
    end

    if eType == EmoteType.WALKS then
        WalkMenuStart(name)
    elseif eType == EmoteType.EXPRESSIONS then
        SetPlayerPedExpression(name, true)
    elseif eType == EmoteType.SHARED then
        SendSharedEmoteRequest(name)
    else
        -- Regular Emote, Dances, Props
        -- Optional: Keybind setting via shift or something could go here
        EmoteMenuStart(name, 1, eType)
    end
    
    if cb then cb('ok') end
end)

RegisterNUICallback('clickBind', function(data, cb)
    local slot = data.slot
    -- Normally we would do `ExecuteCommand("emoteSelect"..slot)` or allow them to bind
    -- We can trigger execution or just bind current emote if shift is held. 
    -- For simplicity, let's just trigger the command
    ExecuteCommand("emoteSelect"..slot)
    
    if cb then cb('ok') end
end)
local currentPreviewVersion = 0

RegisterNUICallback('startPreview', function(data, cb)
    local name = data.name
    local strType = data.type
    
    local eType = EmoteType.EMOTES
    if strType == 'Dances' then eType = EmoteType.DANCES
    elseif strType == 'Prop Emotes' then eType = EmoteType.PROP_EMOTES
    elseif strType == 'Animal Emotes' then eType = EmoteType.ANIMAL_EMOTES
    elseif strType == 'Expressions' then eType = EmoteType.EXPRESSIONS
    end

    -- Explicitly ensure zoom is false for full-body as requested
    zoom = false

    ShowPedMenu()
    LastEmote = { name = name, emoteType = eType }
    
    currentPreviewVersion = currentPreviewVersion + 1
    local myVersion = currentPreviewVersion
    
    if DoesEntityExist(ClonedPed) then
        ClearPedTaskPreview()
        EmoteMenuStartClone(name, eType)
    else
        WaitForClonedPedThenPlayLastAnim()
    end
    
    -- Auto-stop preview after 3 seconds if it's still the active one
    SetTimeout(3000, function()
        if myVersion == currentPreviewVersion and DoesEntityExist(ClonedPed) then
            ClearPedTaskPreview()
        end
    end)
    
    if cb then cb('ok') end
end)

RegisterNUICallback('stopPreview', function(data, cb)
    ClosePedMenu()
    if cb then cb('ok') end
end)

local kvp = GetResourceKvpString('rpemotes_preview_enabled')
PreviewEnabled = kvp == 'true'

RegisterNUICallback('togglePreview', function(data, cb)
    PreviewEnabled = data.enabled
    SetResourceKvp('rpemotes_preview_enabled', tostring(PreviewEnabled))
    
    if not PreviewEnabled then
        ClosePedMenu()
    elseif isMenuOpen then
        ShowPedMenu()
    end
    if cb then cb('ok') end
end)
